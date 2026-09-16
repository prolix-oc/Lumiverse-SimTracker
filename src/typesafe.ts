// TypeSafe AI (Jev) integration for the secondary tracker-generation path.
//
// Jev (docs.typesafe.ai) is a *decision* model, not a text generator: it
// evaluates typed questions (noul / choice / score) against a state and
// returns calibrated numbers and probability distributions. SimTracker uses
// it in three places, all subordinate to the secondary-LLM feature:
//
//   1. Gate      — one speculative fan-out call decides whether the latest
//                  message warrants no tracker ("none"), a quick numeric
//                  patch ("minor"), or a full text regeneration
//                  ("significant" / "structural" / low confidence).
//   2. Fast lane — for "minor" turns, per-field questions synthesize the new
//                  tracker by patching bounded scales, numeric enums, and
//                  boolean flags on the previous payload. No text-LLM call.
//   3. Verify    — after a full secondary-LLM generation, per-field nouls
//                  check the produced payload against the narrative and the
//                  previous state; any P(wrong) over threshold rejects the
//                  append (mirrors TypeSafe's SDE-cascade cookbook).
//   4. Conception — the interceptor's conception engine replaces its 50/50
//                  gray-zone coin flip with per-character fertilization
//                  nouls that weigh the tracked fertility factors against
//                  the scene narrative.
//
// Every failure mode degrades toward the existing full secondary-LLM path:
// a TypeSafe outage, timeout, or low-confidence answer never blocks tracker
// generation.
//
// The module is deliberately pure: network egress goes through the injected
// `cors` transport (spindle.cors + the `cors_proxy` permission), so all
// logic here is exercisable without Lumiverse.

import { normalizeTrackerData } from "./trackerData";

// ── Wire types (docs.typesafe.ai/api) ──────────────────────────────────

export type TypeSafeSettings = {
  apiKey: string;
  model: string;
};

export type TypeSafeQuestion =
  | { type: "noul"; instructions: string; criteria?: { true?: string; false?: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: string[] };

export type TypeSafeAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; legend: Record<string, string>; probabilities: Record<string, number>; confidence: number };

export type TypeSafeAnswers = Record<string, TypeSafeAnswer>;

export type TypeSafeCorsTransport = (
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<unknown>;

const TYPESAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

// ── Client ──────────────────────────────────────────────────────────────

/**
 * POST one state + question map to the TypeSafe evaluation endpoint through
 * the extension CORS proxy. `spindle.cors` returns an undocumented envelope,
 * so `extractAnswers` normalizes the shapes observed in the wild (raw body
 * string, `{answers}`, `{body|data|json|text: …}` nesting, `{ok,status}`
 * error surfaces) and throws a descriptive error otherwise.
 */
export async function evaluateTypeSafe(
  transport: TypeSafeCorsTransport,
  settings: TypeSafeSettings,
  state: unknown,
  questions: Record<string, TypeSafeQuestion>,
  timeoutMs = 20_000,
): Promise<TypeSafeAnswers> {
  if (!settings.apiKey) throw new Error("TypeSafe API key is not configured");
  const body = JSON.stringify({ state, model: settings.model, questions });
  const call = transport(TYPESAFE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body,
  });
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`TypeSafe request timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return extractAnswers(await Promise.race([call, timeout]));
}

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function extractAnswers(raw: unknown): TypeSafeAnswers {
  let obj: unknown = raw;
  if (typeof obj === "string") {
    const text = obj;
    try {
      obj = JSON.parse(text);
    } catch {
      throw new Error(`TypeSafe proxy returned a non-JSON body: ${truncate(text)}`);
    }
  }
  if (!obj || typeof obj !== "object") {
    throw new Error(`TypeSafe proxy returned an unexpected payload: ${truncate(String(obj))}`);
  }
  const rec = obj as Record<string, unknown>;

  // Nested body envelopes: `{body: "<json>"}`, `{data: {...}}`, `{json: …}`,
  // `{text: "<json>"}`. Recurse so each layer only has to handle one shape.
  for (const key of ["body", "data", "json", "text"] as const) {
    const nested = rec[key];
    if (typeof nested === "string" || (nested && typeof nested === "object")) {
      const hasOwn = rec.answers !== undefined;
      if (!hasOwn) return extractAnswers(nested);
    }
  }

  const answers = rec.answers;
  if (answers && typeof answers === "object" && !Array.isArray(answers)) {
    return answers as TypeSafeAnswers;
  }

  const status = typeof rec.status === "number" ? rec.status : null;
  const ok = typeof rec.ok === "boolean" ? rec.ok : null;
  if (ok === false || (status !== null && status >= 400)) {
    const detail = typeof rec.error === "string"
      ? rec.error
      : typeof rec.message === "string"
        ? rec.message
        : truncate(JSON.stringify(rec));
    throw new Error(`TypeSafe HTTP ${status ?? "error"}: ${truncate(detail)}`);
  }
  throw new Error(`TypeSafe proxy response missing \`answers\`: ${truncate(JSON.stringify(rec))}`);
}

// ── Field classification ───────────────────────────────────────────────
//
// Mirrors the metadata signals `inferExampleValue` already relies on
// (backend.ts): explicit type markers, `0=Label` enum codes, `(-100 to 100)`
// ranges, and boolean markers. Only fields whose new value Jev can compute
// *relative to a prior value* are patchable:
//
//   scale — bounded numeric range: delta-mapped score question
//   enum  — numeric enum codes:    one choice option per code
//   flag  — boolean:               noul with strong-signal thresholds
//
// Unbounded counters (`days_preg`, `days_since_first_meeting`), prose
// (`internal_thought`), dates, colors, and arrays are NOT patchable — they
// carry forward unchanged, or the gate routes the turn to the full path.

export type CustomFieldSpec = { key: string; description: string };

export type PatchableField =
  | { kind: "scale"; key: string; label: string; min: number; max: number }
  | { kind: "enum"; key: string; label: string; options: Record<string, string> }
  | { kind: "flag"; key: string; label: string };

// Bracketed type markers only — a bare `int` would eat "Points" from
// "Affection Points". Mirrors the bracket-required markers inferExampleValue
// uses on the same descriptions.
const TYPE_MARKER_RE = /[\[(](?:number|integer|int|float|boolean|bool|string|text|array|list)[\])]/gi;
const ENUM_PAIR_RE = /(\d+)\s*=\s*([^,;]+)/g;
const RANGE_RE = /(-?\d+(?:\.\d+)?)\s*(?:to|[-–—])\s*(-?\d+(?:\.\d+)?)/;
const BOOLEAN_KEYS: Record<string, true> = { preg: true, inactive: true, alive: true, dead: true };

function cleanLabel(description: string): string {
  return description.replace(TYPE_MARKER_RE, " ").replace(/\s+/g, " ").trim();
}

export function classifyPatchableField(key: string, description: string): PatchableField | null {
  const label = cleanLabel(description);
  const desc = description.toLowerCase();

  // Numeric enum codes ("0=Unharmed, 1=Injured, 2=Critical") — must win over
  // the range check so `health`-style fields never become scales.
  const pairs: Array<[string, string]> = [];
  for (const match of description.matchAll(ENUM_PAIR_RE)) {
    pairs.push([match[1], match[2].trim()]);
  }
  if (pairs.length >= 2) {
    const options: Record<string, string> = {};
    for (const [code, text] of pairs) options[code] = text;
    return { kind: "enum", key, label: label || key, options };
  }

  // Bounded numeric range ("(0-200)", "(-100 to 100)").
  const range = RANGE_RE.exec(description);
  if (range) {
    const min = Number(range[1]);
    const max = Number(range[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && min !== max) {
      const [lo, hi] = min < max ? [min, max] : [max, min];
      return { kind: "scale", key, label: label || key, min: lo, max: hi };
    }
  }

  // Booleans: explicit marker, stated true/false, or the well-known keys
  // (exact match only — `days_preg` must stay out).
  if (/[\[(](?:boolean|bool)[\])]/.test(desc) || /\btrue\/false\b/.test(desc) || BOOLEAN_KEYS[key.toLowerCase()] === true) {
    return { kind: "flag", key, label: label || key };
  }

  return null;
}

// ── Fast lane (gate + quick append) ─────────────────────────────────────

/** Questions per fast-lane call: gate + per-character field patches. */
export const FAST_LANE_MAX_QUESTIONS = 24;
/** Characters per fast-lane call; bigger rosters are "structural" anyway. */
export const FAST_LANE_MAX_CHARACTERS = 4;
/** Message characters sent as state — bounds token spend on long posts. */
export const FAST_LANE_MESSAGE_CHAR_CAP = 8_000;

export const GATE_QUESTION_ID = "gate:magnitude";

export type GateDecision = "skip" | "fast" | "full";

export type FastLaneDirective = {
  id: string;
  character: string;
  field: PatchableField;
  prior: number | boolean;
};

export type FastLanePlan = {
  state: Record<string, unknown>;
  questions: Record<string, TypeSafeQuestion>;
  directives: FastLaneDirective[];
};

const SCALE_LEVELS = [
  "Sharp decrease from the current value",
  "Small decrease",
  "Roughly unchanged",
  "Small increase",
  "Sharp increase",
] as const;

const GATE_CRITERIA: Record<string, string | null> = {
  none:
    "Nothing in the message changes any tracked stat; an unchanged tracker append would add nothing",
  minor:
    "Only small shifts to existing numeric scales, enum codes, or boolean flags of already-tracked characters",
  significant:
    "Changes a full tracker update should capture: prose statuses, thoughts, clothing, location, relationships, or time progression",
  structural:
    "Introduces a new character to track, writes one out, or otherwise reshapes the tracked roster",
};

/**
 * Build the single fan-out call for a turn: the gate question plus one
 * question per patchable field of each already-tracked character. Returns
 * null when the fast lane can't apply (no previous payload shape to patch,
 * no patchable fields, or the turn is too large for a bounded question set)
 * — callers fall back to the full secondary-LLM path.
 */
export function buildFastLanePlan(input: {
  message: string;
  previousPayload: Record<string, unknown>;
  fields: CustomFieldSpec[];
}): FastLanePlan | null {
  const characters = normalizeTrackerData(input.previousPayload as Parameters<typeof normalizeTrackerData>[0]).characters ?? [];
  if (characters.length === 0 || characters.length > FAST_LANE_MAX_CHARACTERS) return null;

  // Classification is generic, but `conceived` is policy-excluded: the
  // backend's interceptor conception gate owns that transition (notified-lock
  // + conception_date + in-place mutation), and a fast-lane flip would race
  // it. Every other flag (preg, inactive, lactating, …) stays patchable.
  const patchable = input.fields
    .map((field) => classifyPatchableField(field.key, field.description))
    .filter((field): field is PatchableField => field !== null && field.key !== "conceived");
  if (patchable.length === 0) return null;

  const questions: Record<string, TypeSafeQuestion> = {
    [GATE_QUESTION_ID]: {
      type: "choice",
      instructions:
        "How much does this message change the tracked state of the characters listed in previous state?",
      criteria: GATE_CRITERIA,
    },
  };
  const directives: FastLaneDirective[] = [];
  const trackedCharacters: Array<Record<string, unknown>> = [];

  for (const character of characters) {
    const name = typeof character.name === "string" ? character.name.trim() : "";
    if (!name) continue;
    const tracked: Record<string, unknown> = { name };
    for (const field of patchable) {
      const priorRaw = character[field.key];
      if (field.kind === "flag") {
        if (typeof priorRaw !== "boolean") continue;
        const id = `c${directives.length}:${field.key}`;
        questions[id] = {
          type: "noul",
          instructions:
            `For ${name}: the "${field.key}" flag (${field.label}) is now true as of this message.`,
          criteria: {
            true: `The narrative establishes ${field.key} as true for ${name} at or before this point`,
            false: `${field.key} remains or becomes false for ${name}`,
          },
        };
        directives.push({ id, character: name, field, prior: priorRaw });
        tracked[field.key] = priorRaw;
        continue;
      }
      const prior = Number(priorRaw);
      if (!Number.isFinite(prior)) continue; // absent or malformed → full path's job
      if (field.kind === "scale") {
        const id = `c${directives.length}:${field.key}`;
        questions[id] = {
          type: "score",
          instructions:
            `For ${name}: new value of "${field.key}" (${field.label}) after this message, given the current value ${prior} on a ${field.min}–${field.max} scale.`,
          criteria: [...SCALE_LEVELS],
        };
        directives.push({ id, character: name, field, prior });
      } else {
        const id = `c${directives.length}:${field.key}`;
        const criteria: Record<string, string | null> = {};
        for (const [code, text] of Object.entries(field.options)) criteria[code] = text;
        const currentLabel = field.options[String(prior)] ?? "unlisted";
        questions[id] = {
          type: "choice",
          instructions:
            `For ${name}: new "${field.key}" code (${field.label}). Current: ${prior} (${currentLabel}).`,
          criteria,
        };
        directives.push({ id, character: name, field, prior });
      }
      tracked[field.key] = prior;
      if (Object.keys(questions).length >= FAST_LANE_MAX_QUESTIONS) break;
    }
    trackedCharacters.push(tracked);
    if (Object.keys(questions).length >= FAST_LANE_MAX_QUESTIONS) break;
  }

  if (directives.length === 0) return null;

  const fieldDefinitions: Record<string, string> = {};
  for (const field of patchable) fieldDefinitions[field.key] = field.label;

  return {
    state: {
      message: input.message.slice(0, FAST_LANE_MESSAGE_CHAR_CAP),
      tracked_characters: trackedCharacters,
      field_definitions: fieldDefinitions,
    },
    questions,
    directives,
  };
}

/**
 * Route on the gate answer. Skipping a generation is the risky direction (a
 * message silently loses its tracker), so "none" demands a higher bar than
 * the user's fast-lane floor; anything uncertain routes to the full path.
 */
export function interpretGate(answers: TypeSafeAnswers, confidenceFloor: number): GateDecision {
  const gate = answers[GATE_QUESTION_ID];
  if (!gate || gate.type !== "choice") return "full";
  if (gate.choice === "none" && gate.confidence >= Math.max(confidenceFloor, 0.7)) return "skip";
  if (gate.choice === "minor" && gate.confidence >= confidenceFloor) return "fast";
  return "full";
}

// Noul answers carry no confidence (per API docs); strong-signal thresholds
// gate flag flips instead. Between the thresholds the prior carries forward.
export const FLAG_TRUE_THRESHOLD = 0.8;
export const FLAG_FALSE_THRESHOLD = 0.2;
/** A scale level spans 10% of the field range; ±2 levels is the max drift. */
export const SCALE_STEP_FRACTION = 10;

export type FastLaneResult = {
  payload: Record<string, unknown>;
  changed: string[];
};

/**
 * Apply fast-lane answers to a deep clone of the previous payload. Fields
 * whose answers arrive ambiguous (score/choice confidence below the floor,
 * noul between thresholds) keep their prior value — the safe direction.
 * Patches every representation of the character (the `characters` array and
 * legacy top-level `{Name: {...}}` keys) so normalized and raw payloads both
 * stay consistent.
 */
export function applyFastLaneAnswers(
  previousPayload: Record<string, unknown>,
  directives: FastLaneDirective[],
  answers: TypeSafeAnswers,
  confidenceFloor: number,
): FastLaneResult {
  const payload = JSON.parse(JSON.stringify(previousPayload)) as Record<string, unknown>;
  const changed: string[] = [];

  const targetsFor = (name: string): Array<Record<string, unknown>> => {
    const targets: Array<Record<string, unknown>> = [];
    const list = payload.characters;
    if (Array.isArray(list)) {
      const entry = list.find(
        (entry) => entry && typeof entry === "object" && typeof (entry as Record<string, unknown>).name === "string"
          && ((entry as Record<string, unknown>).name as string).trim().toLowerCase() === name.toLowerCase(),
      ) as Record<string, unknown> | undefined;
      if (entry) targets.push(entry);
    }
    const keyed = payload[name];
    if (keyed && typeof keyed === "object" && !Array.isArray(keyed)) {
      targets.push(keyed as Record<string, unknown>);
    }
    return targets;
  };

  for (const directive of directives) {
    const answer = answers[directive.id];
    if (!answer) continue;
    const targets = targetsFor(directive.character);
    if (targets.length === 0) continue;

    let next: number | boolean | null = null;
    if (directive.field.kind === "scale" && answer.type === "score") {
      if (answer.confidence >= confidenceFloor) {
        const step = (directive.field.max - directive.field.min) / SCALE_STEP_FRACTION;
        const delta = (answer.score - (SCALE_LEVELS.length - 1) / 2) * step;
        const clamped = Math.min(directive.field.max, Math.max(directive.field.min, (directive.prior as number) + delta));
        next = Math.round(clamped);
      }
    } else if (directive.field.kind === "enum" && answer.type === "choice") {
      if (answer.confidence >= confidenceFloor && directive.field.options[answer.choice] !== undefined) {
        const code = Number(answer.choice);
        if (Number.isFinite(code)) next = code;
      }
    } else if (directive.field.kind === "flag" && answer.type === "noul") {
      if (answer.noul >= FLAG_TRUE_THRESHOLD) next = true;
      else if (answer.noul <= FLAG_FALSE_THRESHOLD) next = false;
    }

    if (next === null || next === directive.prior) continue;
    for (const target of targets) target[directive.field.key] = next;
    changed.push(`${directive.character}.${directive.field.key}: ${String(directive.prior)} → ${String(next)}`);
  }

  return { payload, changed };
}

// ── Verification (full secondary-LLM path) ──────────────────────────────

export const VERIFY_MAX_FIELD_QUESTIONS = 10;
/** P(wrong) at which a verify noul fires (SDE-cascade cookbook uses 0.7). */
export const VERIFY_FIRE_THRESHOLD = 0.7;
export const VERIFY_NARRATIVE_CHAR_CAP = 8_000;

export type VerifyPlan = {
  state: Record<string, unknown>;
  questions: Record<string, TypeSafeQuestion>;
};

/**
 * Build the post-generation verification fan-out: one noul per changed
 * numeric/boolean field, plus dropped/invented-character checks. Returns
 * null when there is nothing meaningful to compare (first generation in a
 * chat, or no textual changes to check).
 */
export function buildVerifyPlan(input: {
  narrative: string;
  previousPayload: Record<string, unknown>;
  generatedPayload: Record<string, unknown>;
}): VerifyPlan | null {
  const previous = normalizeTrackerData(input.previousPayload as Parameters<typeof normalizeTrackerData>[0]).characters ?? [];
  if (previous.length === 0) return null;
  const generated = normalizeTrackerData(input.generatedPayload as Parameters<typeof normalizeTrackerData>[0]).characters ?? [];
  const generatedByName = new Map<string, Record<string, unknown>>();
  for (const character of generated) {
    if (typeof character.name === "string") generatedByName.set(character.name.trim().toLowerCase(), character);
  }

  const questions: Record<string, TypeSafeQuestion> = {};
  const previousByName = new Map<string, Record<string, unknown>>();
  for (const character of previous) {
    if (typeof character.name !== "string") continue;
    previousByName.set(character.name.trim().toLowerCase(), character);
    const after = generatedByName.get(character.name.trim().toLowerCase());
    if (!after) continue;
    for (const [key, oldValue] of Object.entries(character)) {
      if (key === "name") continue;
      const newValue = after[key];
      if (newValue === oldValue) continue;
      if (typeof oldValue !== "number" && typeof oldValue !== "boolean" && typeof oldValue !== "string") continue;
      if (typeof newValue !== "number" && typeof newValue !== "boolean" && typeof newValue !== "string") continue;
      if (Object.keys(questions).length >= VERIFY_MAX_FIELD_QUESTIONS) break;
      const id = `field:${character.name}:${key}`;
      questions[id] = {
        type: "noul",
        instructions:
          `The generated tracker sets "${key}" for ${character.name} to "${String(newValue)}" (previously "${String(oldValue)}"). This new value is unsupported by, or contradicts, the narrative.`,
      };
    }
  }

  questions["roster:dropped"] = {
    type: "noul",
    instructions:
      "A character tracked in the previous tracker disappears from the generated tracker without the narrative writing them out.",
  };
  questions["roster:invented"] = {
    type: "noul",
    instructions:
      "The generated tracker introduces a character or field value that is neither present in the previous tracker nor supported by the narrative.",
  };

  return {
    state: {
      narrative: input.narrative.slice(0, VERIFY_NARRATIVE_CHAR_CAP),
      previous_tracker: input.previousPayload,
      generated_tracker: input.generatedPayload,
    },
    questions,
  };
}

export type VerifyVerdict = {
  ok: boolean;
  reasons: string[];
};

export function interpretVerifyAnswers(
  answers: TypeSafeAnswers,
  fireThreshold = VERIFY_FIRE_THRESHOLD,
): VerifyVerdict {
  const reasons: string[] = [];
  for (const [id, answer] of Object.entries(answers)) {
    if (answer.type !== "noul") continue;
    if (answer.noul >= fireThreshold) {
      reasons.push(`${id} (P(wrong) = ${answer.noul.toFixed(2)})`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

// ── Conception gate ────────────────────────────────────────────────────
//
// The interceptor's conception engine (backend.ts) fires when a fertile
// female/futanari character's womb_fullness_pct exceeds the threshold.
// Fullness at the auto-pass point is deterministic, but the gray zone
// between threshold and auto-pass was historically a 50/50 coin flip.
// Jev replaces that coin: one noul per at-risk character weighs the tracked
// fertility factors (cycle stage/day, receptivity, breeding count, cervix
// state) against the scene narrative.

export const CONCEPTION_FIRE_THRESHOLD = 0.5;

export type ConceptionCandidate = {
  name: string;
  stats: Record<string, unknown>;
};

/** Ordered factor summary embedded in each question (array: iteration order matters). */
const CONCEPTION_FACTOR_KEYS = [
  "sex",
  "cycle_stage_id",
  "cycle_day",
  "womb_fullness_pct",
  "womb_receptivity_pct",
  "cervix_state_id",
  "breeding_count",
] as const;

export function buildConceptionQuestions(candidates: ConceptionCandidate[]): {
  state: Record<string, unknown>;
  questions: Record<string, TypeSafeQuestion>;
} {
  const factors: Record<string, string> = {};
  const questions: Record<string, TypeSafeQuestion> = {};
  for (const candidate of candidates) {
    const summary = CONCEPTION_FACTOR_KEYS
      .filter((key) => {
        const value = candidate.stats[key];
        return value !== undefined && value !== null && value !== "";
      })
      .map((key) => `${key}=${String(candidate.stats[key])}`);
    factors[candidate.name] = summary.join(", ");
    questions[`conceive:${candidate.name}`] = {
      type: "noul",
      instructions:
        `"${candidate.name}" is in a fertile window with womb fullness in the gray zone (above the 85% threshold, ` +
        `below the automatic 100%). Given her tracked factors (${summary.join(", ")}) and the scene narrative, ` +
        `does fertilization occur this turn? Repeated internal finishes (breeding_count), high womb receptivity, ` +
        `ovulation/rut, and a split cervix (cervix_state_id=7) raise the odds; contraception, low receptivity, ` +
        `and marginal cycle timing lower them.`,
      criteria: {
        true: `Fertilization occurs for ${candidate.name} this turn`,
        false: `No fertilization for ${candidate.name} this turn`,
      },
    };
  }
  return { state: { tracked_characters: factors }, questions };
}

/**
 * Candidates whose conception noul met the fire threshold. A missing or
 * malformed answer reads as "did not fire" — the caller's failure path
 * handles whole-call degradation separately.
 */
export function interpretConceptionAnswers(
  answers: TypeSafeAnswers,
  candidates: ConceptionCandidate[],
  fireThreshold = CONCEPTION_FIRE_THRESHOLD,
): string[] {
  const fired: string[] = [];
  for (const candidate of candidates) {
    const answer = answers[`conceive:${candidate.name}`];
    if (answer?.type !== "noul") continue;
    if (answer.noul >= fireThreshold) fired.push(candidate.name);
  }
  return fired;
}

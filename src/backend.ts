import { getTemplatePresetById, getTemplatePresets, type TemplatePreset } from "./templatePresets";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

declare const spindle: import("lumiverse-spindle-types").SpindleAPI;

type TrackerConfig = {
  trackerTagName: string;
  codeBlockIdentifier: string;
  hideSimBlocks: boolean;
  templateId: string;
  trackerFormat: "json" | "yaml";
  retainTrackerCount: number;
  enableInlineTemplates: boolean;
  userPresets: TemplatePreset[];
  inlinePacks: Array<Record<string, unknown>>;
  useSecondaryLLM: boolean;
  secondaryLLMConnectionId: string;
  secondaryLLMModel: string;
  secondaryLLMMessageCount: number;
  secondaryLLMTemperature: number;
  secondaryLLMStripHTML: boolean;
};

const DEFAULT_CONFIG: TrackerConfig = {
  trackerTagName: "tracker",
  codeBlockIdentifier: "sim",
  hideSimBlocks: true,
  templateId: "bento-style-tracker",
  trackerFormat: "json",
  retainTrackerCount: 3,
  enableInlineTemplates: false,
  userPresets: [],
  inlinePacks: [],
  useSecondaryLLM: false,
  secondaryLLMConnectionId: "",
  secondaryLLMModel: "",
  secondaryLLMMessageCount: 5,
  secondaryLLMTemperature: 0.7,
  secondaryLLMStripHTML: true,
};

const CONFIG_PATH = "preferences.json";

let config: TrackerConfig = { ...DEFAULT_CONFIG };
let lastSimStats = "{}";
let activeUserId: string | null = null;
let loadedConfigUserId: string | null = null;
/**
 * Last chat id the extension saw activity on. The interceptor signature
 * (`context: unknown`) doesn't contractually expose the chat id, so we
 * mirror it from `GENERATION_STARTED` (which does carry it) and from
 * any other event that surfaces a chat id. Used as a fallback when the
 * interceptor context can't be parsed.
 */
let activeChatId: string | null = null;

type TrackerHistoryEntry = { messageId: string; payload: string };

/**
 * Per-chat ordered history of tracker payloads, keyed by chat id. The list is
 * ordered oldest → newest. Entries are appended when a tracker tag is first
 * seen in a message, and upserted when a message is edited. This is a
 * side-channel that survives `registerTagInterceptor`'s `removeFromMessage`
 * behaviour — the frontend asks Lumiverse to remove the tracker tag from the
 * displayed/canonical message so users don't see raw JSON, but by capturing
 * the content via `MESSAGE_TAG_INTERCEPTED` we retain a complete history that
 * can still be referenced by the main and secondary LLM generation flows.
 */
const chatTrackerHistory = new Map<string, TrackerHistoryEntry[]>();
const rehydratedChats = new Set<string>();

/**
 * Tracks which (chatId, characterName) pairs have already received a
 * conception notice so we don't spam the same directive repeatedly.
 * Cleared when the character is explicitly marked `conceived: true` or
 * `preg: true` in a subsequent tracker payload.
 */
const conceptionNotified = new Set<string>();

/**
 * Conception-gate config.  Threshold is the womb fullness % strictly above
 * which the coin-flip fires (auto-pass at 100 %).  Eligibility window is
 * ovulation, rut, or early luteal (days 17-19).  Triggered characters get
 * their stored tracker mutated in-place to set `conceived: true` so the
 * LLM sees the authoritative state on the next turn.
 */
const CONCEPTION_CONFIG = {
  threshold: 85,
  autoAt: 100,
  earlyLutealMaxDay: 19,
};

type MessageContext = {
  chatId: string | null;
  messageId: string | null;
  content: string | null;
};

type CommandResultPayload = {
  command: string;
  ok: boolean;
  message: string;
  block?: string;
  mode?: "chat_mutation" | "fallback";
};

const runtime = {
  grantedPermissions: new Set<string>(),
  seededPresets: [] as TemplatePreset[],
};

function getAllPresets(): TemplatePreset[] {
  return [...getTemplatePresets(), ...runtime.seededPresets, ...config.userPresets];
}

function getActivePreset(): TemplatePreset {
  return getAllPresets().find((preset) => preset.id === config.templateId)
    || getTemplatePresetById(config.templateId)
    || getTemplatePresetById(DEFAULT_CONFIG.templateId);
}

function sanitizeIdentifier(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_CONFIG.codeBlockIdentifier;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return DEFAULT_CONFIG.codeBlockIdentifier;
  return trimmed.replace(/[^a-z0-9_-]/g, "") || DEFAULT_CONFIG.codeBlockIdentifier;
}

function sanitizeTagName(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_CONFIG.trackerTagName;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return DEFAULT_CONFIG.trackerTagName;
  return trimmed.replace(/[^a-z0-9_-]/g, "") || DEFAULT_CONFIG.trackerTagName;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTrackerFenceRegex(identifier: string, flags = "i"): RegExp {
  const cleanIdentifier = sanitizeIdentifier(identifier);
  const escapedIdentifier = escapeRegex(cleanIdentifier);
  return new RegExp(
    String.raw`\`\`\`[ \t]*${escapedIdentifier}(?=[ \t\r\n]|$)[^\n\r]*\r?\n([\s\S]*?)\r?\n?\s*\`\`\``,
    flags,
  );
}

function parseTagAttributes(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const key = match[1] || "";
    if (!key) continue;
    out[key] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return out;
}

function buildTrackerTagRegex(tagName: string, flags = "i"): RegExp {
  const safeTag = escapeRegex(sanitizeTagName(tagName));
  return new RegExp(String.raw`<${safeTag}\b([^>]*)>([\s\S]*?)<\/${safeTag}>`, flags);
}

function extractSimBlock(message: string, identifier: string): string | null {
  const re = buildTrackerFenceRegex(identifier, "i");
  const match = message.match(re);
  if (!match) return null;
  return match[1]?.trim() || null;
}

function extractTrackerTag(message: string, tagName: string, identifier: string): string | null {
  const re = buildTrackerTagRegex(tagName, "ig");
  const cleanIdentifier = sanitizeIdentifier(identifier);
  let match: RegExpExecArray | null;
  while ((match = re.exec(message)) !== null) {
    const attrs = parseTagAttributes(match[1] || "");
    const typeAttr = sanitizeIdentifier(attrs.type || "");
    if (typeAttr && typeAttr !== cleanIdentifier) continue;
    return (match[2] || "").trim() || null;
  }
  return null;
}

function extractTrackerTagLoose(message: string, tagName: string): string | null {
  const re = buildTrackerTagRegex(tagName, "ig");
  const match = re.exec(message);
  return match ? (match[2] || "").trim() || null : null;
}

function buildCanonicalTrackerTag(payload: string, identifier: string): string {
  const tagName = sanitizeTagName(config.trackerTagName);
  const safeIdentifier = sanitizeIdentifier(identifier);
  return `<${tagName} type="${safeIdentifier}">\n${payload.trim()}\n</${tagName}>`;
}

function extractAnyTrackerFencePayload(message: string): string | null {
  const fenceRe = /```[ \t]*([a-z0-9_-]+)(?=[ \t\r\n]|$)[^\n\r]*\r?\n([\s\S]*?)\r?\n?\s*```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(message)) !== null) {
    const payload = (match[2] || "").trim();
    if (!payload) continue;
    const directTagPayload = extractTrackerTagLoose(payload, config.trackerTagName);
    if (directTagPayload) return directTagPayload;
    const parsed = parseTrackerPayload(payload);
    if (parsed) return payload;
  }
  return null;
}

function legacyHiddenDivTrackerRanges(message: string): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const divRe = /<div\b([^>]*)>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = divRe.exec(message)) !== null) {
    const attrs = match[1] || "";
    const inner = match[2] || "";
    const full = match[0] || "";
    if (typeof match.index !== "number" || !full) continue;
    if (!/style\s*=\s*(?:"[^"]*display\s*:\s*none\s*;?[^"]*"|'[^']*display\s*:\s*none\s*;?[^']*')/i.test(attrs)) {
      continue;
    }
    if (!extractLegacyHiddenDivNormalizedPayload(inner, config.codeBlockIdentifier)) continue;
    ranges.push({ start: match.index, end: match.index + full.length });
  }
  return ranges;
}

function extractLegacyHiddenDivNormalizedPayload(inner: string, identifier: string): string | null {
  const directTagPayload = extractTrackerTagLoose(inner, config.trackerTagName);
  if (directTagPayload) return directTagPayload;

  const fencedPayload = extractSimBlock(inner, identifier)
    || (identifier !== DEFAULT_CONFIG.codeBlockIdentifier
      ? extractSimBlock(inner, DEFAULT_CONFIG.codeBlockIdentifier)
      : null)
    || extractAnyTrackerFencePayload(inner);
  if (!fencedPayload) return null;

  return extractTrackerTagLoose(fencedPayload, config.trackerTagName) || fencedPayload.trim() || null;
}

function extractLegacyHiddenDivTrackerPayload(message: string): string | null {
  const divRe = /<div\b([^>]*)>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = divRe.exec(message)) !== null) {
    const attrs = match[1] || "";
    const inner = match[2] || "";
    if (!/style\s*=\s*(?:"[^"]*display\s*:\s*none\s*;?[^"]*"|'[^']*display\s*:\s*none\s*;?[^']*')/i.test(attrs)) {
      continue;
    }
    const payload = extractLegacyHiddenDivNormalizedPayload(inner, config.codeBlockIdentifier);
    if (payload) return payload;
  }
  return null;
}

function extractTrackerPayloadFromMessage(message: string): string | null {
  return (
    extractTrackerTag(message, config.trackerTagName, config.codeBlockIdentifier) ||
    extractSimBlock(message, config.codeBlockIdentifier) ||
    extractLegacyHiddenDivTrackerPayload(message)
  );
}

function normalizeLegacyHiddenDivTrackers(message: string): { content: string; replacements: number } {
  if (!message) return { content: message, replacements: 0 };

  const tagName = sanitizeTagName(config.trackerTagName);
  const identifier = sanitizeIdentifier(config.codeBlockIdentifier);
  const divRe = /<div\b([^>]*)>([\s\S]*?)<\/div>/gi;
  let replacements = 0;

  const content = message.replace(divRe, (full, rawAttrs, rawInner) => {
    const attrs = typeof rawAttrs === "string" ? rawAttrs : "";
    const inner = typeof rawInner === "string" ? rawInner : "";
    if (!/style\s*=\s*(?:"[^"]*display\s*:\s*none\s*;?[^"]*"|'[^']*display\s*:\s*none\s*;?[^']*')/i.test(attrs)) {
      return full;
    }

    const payload = extractLegacyHiddenDivNormalizedPayload(inner, identifier);
    if (!payload) return full;

    replacements += 1;
    return buildCanonicalTrackerTag(payload, identifier);
  });

  return { content, replacements };
}

function sanitizeTrackerFormat(value: unknown): "json" | "yaml" {
  return value === "yaml" ? "yaml" : "json";
}

function sanitizeTemplateId(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_CONFIG.templateId;
  const trimmed = value.trim();
  return trimmed || DEFAULT_CONFIG.templateId;
}

function sanitizeRetainCount(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return DEFAULT_CONFIG.retainTrackerCount;
  return Math.max(0, Math.min(20, Math.floor(value)));
}

function sanitizePresetArray(value: unknown): TemplatePreset[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object")
    .map((item, idx) => {
      const p = item as Record<string, unknown>;
      return {
        id: typeof p.id === "string" && p.id ? p.id : `user-preset-${idx}`,
        templateName: typeof p.templateName === "string" ? p.templateName : `User Preset ${idx + 1}`,
        templateAuthor: typeof p.templateAuthor === "string" ? p.templateAuthor : "User",
        htmlTemplate: typeof p.htmlTemplate === "string" ? p.htmlTemplate : "",
        sysPrompt: typeof p.sysPrompt === "string" ? p.sysPrompt : "",
        displayInstructions: typeof p.displayInstructions === "string" ? p.displayInstructions : "",
        customFields: Array.isArray(p.customFields) ? (p.customFields as any) : [],
        extSettings: (p.extSettings && typeof p.extSettings === "object" ? p.extSettings : {}) as Record<string, unknown>,
      };
    });
}

function sanitizeSinglePreset(value: unknown, fallbackId: string): TemplatePreset | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  return {
    id: typeof p.id === "string" && p.id ? p.id : fallbackId,
    templateName: typeof p.templateName === "string" && p.templateName ? p.templateName : fallbackId,
    templateAuthor: typeof p.templateAuthor === "string" ? p.templateAuthor : "Seeded",
    htmlTemplate: typeof p.htmlTemplate === "string" ? p.htmlTemplate : "",
    sysPrompt: typeof p.sysPrompt === "string" ? p.sysPrompt : "",
    displayInstructions: typeof p.displayInstructions === "string" ? p.displayInstructions : "",
    inlineTemplatesEnabled: typeof p.inlineTemplatesEnabled === "boolean" ? p.inlineTemplatesEnabled : false,
    inlineTemplates: Array.isArray(p.inlineTemplates) ? p.inlineTemplates : [],
    customFields: Array.isArray(p.customFields)
      ? (p.customFields as Array<{ key: string; description: string }>)
      : [],
    extSettings: (p.extSettings && typeof p.extSettings === "object" ? p.extSettings : {}) as Record<string, unknown>,
  };
}

function sanitizeInlinePacks(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
}

function sanitizeInlineEnabled(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_CONFIG.enableInlineTemplates;
}

function sanitizeBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeStr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

/**
 * Coerce known placeholder model strings (Spindle's connection-profile UI
 * seeds the field with literal "string", and users sometimes paste an
 * unfilled example) to empty so they fall the secondary-LLM pre-flight
 * check instead of silently 400ing at the provider.
 */
function sanitizeSecondaryLLMModel(value: unknown, fallback: string): string {
  const raw = sanitizeStr(value, fallback);
  const lowered = raw.toLowerCase();
  if (lowered === "string" || lowered === "your-model-here" || lowered === "model" || lowered === "null" || lowered === "undefined") {
    return "";
  }
  return raw;
}

function sanitizeMessageCount(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return DEFAULT_CONFIG.secondaryLLMMessageCount;
  return Math.max(1, Math.min(50, Math.floor(value)));
}

function sanitizeTemperature(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return DEFAULT_CONFIG.secondaryLLMTemperature;
  return Math.max(0, Math.min(2, Math.round(value * 100) / 100));
}

function hasPermission(name: string): boolean {
  return runtime.grantedPermissions.has(name);
}

async function trackEvent(
  eventName: string,
  payload?: Record<string, unknown>,
  options?: { level?: "debug" | "info" | "warn" | "error"; chatId?: string },
): Promise<void> {
  if (!hasPermission("event_tracking")) return;
  try {
    await spindle.events.track(eventName, payload, options);
  } catch {
    // Telemetry should never break runtime behavior.
  }
}

function readMessageContext(payload: unknown): MessageContext {
  if (!payload || typeof payload !== "object") {
    return { chatId: null, messageId: null, content: null };
  }
  const obj = payload as Record<string, unknown>;
  const nestedMessage = (obj.message && typeof obj.message === "object" ? obj.message : {}) as Record<string, unknown>;
  const nestedChat = (obj.chat && typeof obj.chat === "object" ? obj.chat : {}) as Record<string, unknown>;

  const chatIdCandidates = [obj.chatId, obj.chat_id, nestedMessage.chatId, nestedMessage.chat_id, nestedChat.id, obj.id];
  const messageIdCandidates = [obj.messageId, obj.message_id, nestedMessage.id, nestedMessage.messageId, obj.id];

  const content =
    (typeof nestedMessage.content === "string" ? nestedMessage.content : null) ||
    (typeof obj.content === "string" ? obj.content : null);

  const chatId = chatIdCandidates.find((value) => typeof value === "string" && value.trim().length > 0) as
    | string
    | undefined;
  const messageId = messageIdCandidates.find((value) => typeof value === "string" && value.trim().length > 0) as
    | string
    | undefined;

  return {
    chatId: chatId || null,
    messageId: messageId || null,
    content,
  };
}

// ── Per-Chat Tracker History (side-channel) ──────────────────────────
//
// Maintains a backend-owned record of every tracker payload the extension
// has seen in each chat, keyed by message id. Populated from:
//   1. MESSAGE_TAG_INTERCEPTED — fires as soon as the frontend tag
//      interceptor observes a tracker tag, BEFORE `removeFromMessage`
//      has a chance to clear it from the canonical message content.
//   2. MESSAGE_SENT / MESSAGE_EDITED — fallback for messages whose
//      tracker blocks survived as code fences or tags in the content.
//   3. rehydrateChatTrackerHistory — initial scan of the current chat
//      on demand, so history is populated even for chats the extension
//      wasn't active in when the message was originally generated.

function recordChatTracker(chatId: string | null, messageId: string | null, payload: string): void {
  if (!chatId || !messageId) return;
  const trimmed = payload.trim();
  if (!trimmed) return;
  let history = chatTrackerHistory.get(chatId);
  if (!history) {
    history = [];
    chatTrackerHistory.set(chatId, history);
  }
  const existingIdx = history.findIndex((entry) => entry.messageId === messageId);
  if (existingIdx >= 0) {
    history[existingIdx] = { messageId, payload: trimmed };
  } else {
    history.push({ messageId, payload: trimmed });
  }
}

function forgetChatTracker(chatId: string | null, messageId: string | null): void {
  if (!chatId || !messageId) return;
  const history = chatTrackerHistory.get(chatId);
  if (!history) return;
  const idx = history.findIndex((entry) => entry.messageId === messageId);
  if (idx >= 0) history.splice(idx, 1);
}

function getChatTrackerHistory(chatId: string | null): TrackerHistoryEntry[] {
  if (!chatId) return [];
  return chatTrackerHistory.get(chatId) || [];
}

async function normalizeLegacyTrackersInChat(chatId: string): Promise<Array<{
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  extra: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  swipe_id: number;
  swipes: string[];
  swipe_dates: number[];
}>> {
  const messages = await spindle.chat.getMessages(chatId);
  if (!hasPermission("chat_mutation")) return messages;

  let repairedMessages = 0;
  let repairedBlocks = 0;

  for (const msg of messages) {
    const normalizedContent = normalizeLegacyHiddenDivTrackers(msg.content);
    const normalizedSwipes = msg.swipes.map((swipe) => normalizeLegacyHiddenDivTrackers(swipe));
    const swipesChanged = normalizedSwipes.some((entry, idx) => entry.content !== msg.swipes[idx]);
    const replacements = normalizedContent.replacements
      + normalizedSwipes.reduce((sum, entry) => sum + entry.replacements, 0);

    if (replacements === 0) continue;

    const nextSwipes = swipesChanged ? normalizedSwipes.map((entry) => entry.content) : msg.swipes;
    await spindle.chat.updateMessage(chatId, msg.id, {
      content: normalizedContent.content,
      swipes: nextSwipes,
      skipChunkRebuild: true,
    } as {
      content?: string;
      swipes?: string[];
      skipChunkRebuild?: boolean;
    });

    msg.content = normalizedContent.content;
    msg.swipes = nextSwipes;
    if (typeof nextSwipes[msg.swipe_id] === "string") {
      msg.content = nextSwipes[msg.swipe_id] as string;
    }

    repairedMessages += 1;
    repairedBlocks += replacements;
  }

  if (repairedBlocks > 0) {
    spindle.log.info(
      `Normalized ${repairedBlocks} legacy hidden tracker block(s) across ${repairedMessages} message(s) in chat ${chatId}`,
    );
  }

  return messages;
}

async function rehydrateChatTrackerHistory(chatId: string | null): Promise<void> {
  if (!chatId) return;
  try {
    const messages = await normalizeLegacyTrackersInChat(chatId);
    if (rehydratedChats.has(chatId)) return;
    rehydratedChats.add(chatId);
    let history = chatTrackerHistory.get(chatId);
    if (!history) {
      history = [];
      chatTrackerHistory.set(chatId, history);
    }
    const known = new Set(history.map((entry) => entry.messageId));
    // Preserve existing (interceptor-sourced) order: append any newly
    // discovered trackers that haven't been recorded yet, in chat order.
    for (const msg of messages) {
      if (known.has(msg.id)) continue;
      const payload = extractTrackerPayloadFromMessage(msg.content);
      if (payload) {
        history.push({ messageId: msg.id, payload });
        known.add(msg.id);
      }
    }
    // Re-sort entries to match current chat order where possible.
    const order = new Map<string, number>();
    messages.forEach((msg, idx) => order.set(msg.id, idx));
    history.sort((a, b) => {
      const ai = order.get(a.messageId);
      const bi = order.get(b.messageId);
      if (ai === undefined && bi === undefined) return 0;
      if (ai === undefined) return 1;
      if (bi === undefined) return -1;
      return ai - bi;
    });
  } catch {
    // Rehydration is best-effort.
  }
}

/**
 * Return the `limit` most recent tracker entries for a chat, optionally
 * excluding the target message id (used when searching for *prior*
 * trackers relative to an in-progress generation target). Results are
 * returned oldest → newest so callers can present a progression.
 */
function getRecentChatTrackers(
  chatId: string | null,
  limit: number,
  excludeMessageId?: string | null,
): TrackerHistoryEntry[] {
  if (!chatId || limit <= 0) return [];
  const history = chatTrackerHistory.get(chatId);
  if (!history || history.length === 0) return [];
  const filtered = excludeMessageId
    ? history.filter((entry) => entry.messageId !== excludeMessageId)
    : history.slice();
  if (filtered.length <= limit) return filtered;
  return filtered.slice(filtered.length - limit);
}

type CharacterStats = Record<string, unknown>;

function getCharactersFromPayload(payload: Record<string, unknown>): CharacterStats[] {
  const chars = payload.characters;
  if (!Array.isArray(chars)) return [];
  return chars.filter((c): c is CharacterStats => c && typeof c === "object" && !Array.isArray(c));
}

function isFemaleOrFuta(stats: CharacterStats): boolean {
  const sex = String(stats.sex || "").toLowerCase();
  return ["female", "futanari", "futa", "both", "intersex", "hermaphrodite"].includes(sex);
}

function isOvulating(stats: CharacterStats): boolean {
  const stage = String(stats.cycle_stage || "").toLowerCase();
  const stageId = Number(stats.cycle_stage_id || 0);
  return stage === "ovulation" || stageId === 3;
}

function isInFertileWindow(stats: CharacterStats): boolean {
  const stage = String(stats.cycle_stage || "").toLowerCase();
  const stageId = Number(stats.cycle_stage_id || 0);
  if (stage === "ovulation" || stageId === 3) return true;
  if (stage === "rut" || stageId === 6) return true;
  if (stage === "luteal" || stageId === 4) {
    const day = Number(stats.cycle_day || 0);
    return day > 0 && day <= CONCEPTION_CONFIG.earlyLutealMaxDay;
  }
  return false;
}

function extractCurrentDate(payload: Record<string, unknown>): string {
  const world = payload.worldData as Record<string, unknown> | undefined;
  const date = world?.current_date;
  if (typeof date === "string" && date.trim()) return date.trim();
  return new Date().toISOString().slice(0, 10);
}

function isAlreadyConceivedOrPregnant(stats: CharacterStats): boolean {
  return stats.preg === true || stats.conceived === true || stats.conception_date === true;
}

function coinFlip(): boolean {
  return Math.random() < 0.5;
}

/**
 * Inspect the most recent tracker payload for a chat and decide whether
 * any female character should receive a conception nudge.  Returns an
 * array of character names that triggered this turn.
 *
 * Rules:
 *   - Character must be female/futa, ovulating, not already conceived/pregnant.
 *   - womb_fullness_pct must be > threshold (default 80).
 *   - If fullness == autoAt (default 100) the nudge is automatic.
 *   - If threshold < fullness < autoAt, a coin flip decides.
 *   - Once a (chatId, name) pair has been notified, it won't be notified
 *     again until the character is explicitly marked conceived/pregnant
 *     in a tracker payload (which clears the flag).
 */
function checkConceptionTriggers(chatId: string | null, payload: Record<string, unknown>): string[] {
  if (!chatId) return [];
  const characters = getCharactersFromPayload(payload);
  const triggered: string[] = [];

  for (const stats of characters) {
    if (!isFemaleOrFuta(stats)) continue;
    if (isAlreadyConceivedOrPregnant(stats)) {
      // She's officially flagged; drop the lock and skip
      const key = `${chatId}::${stats.name}`;
      if (conceptionNotified.has(key)) conceptionNotified.delete(key);
      continue;
    }
    if (!isInFertileWindow(stats)) continue;

    const fullness = Number(stats.womb_fullness_pct);
    if (!Number.isFinite(fullness) || fullness <= CONCEPTION_CONFIG.threshold) continue;

    const key = `${chatId}::${stats.name}`;
    if (conceptionNotified.has(key)) {
      // Coin already passed; the LLM dropped `conceived` from its emission.
      // Re-add to the trigger list so the mutation path re-asserts it.
      triggered.push(String(stats.name || "Unknown"));
      continue;
    }

    const shouldTrigger = fullness >= CONCEPTION_CONFIG.autoAt || coinFlip();
    if (shouldTrigger) {
      conceptionNotified.add(key);
      triggered.push(String(stats.name || "Unknown"));
    }
  }

  return triggered;
}

type ConceptionMutation = {
  messageId: string;
  oldPayload: string;
  newPayload: string;
};

/**
 * Build a forced-conception mutation plan against the most recent stored
 * tracker payload.  Returns the old/new payload pair (and source message
 * ID) when the named characters would actually flip to `conceived: true`,
 * or null when there's nothing to do.  The caller is responsible for
 * committing the mutation to history and rewriting any in-flight LLM
 * context to match.
 */
function planForcedConception(
  chatId: string | null,
  names: string[],
  conceptionDate: string,
): ConceptionMutation | null {
  if (!chatId || names.length === 0) return null;
  const history = chatTrackerHistory.get(chatId);
  if (!history || history.length === 0) return null;
  const latest = history[history.length - 1];
  const parsed = parseTrackerPayload(latest.payload);
  if (!parsed) return null;

  const characters = getCharactersFromPayload(parsed as Record<string, unknown>);
  let mutated = false;

  for (const char of characters) {
    if (typeof char.name !== "string" || !names.includes(char.name)) continue;
    if (char.preg === true || char.conceived === true) continue;
    char.conceived = true;
    if (typeof char.conception_date !== "string" || !char.conception_date.trim()) {
      char.conception_date = conceptionDate;
    }
    mutated = true;
  }

  if (!mutated) return null;

  const newPayload = JSON.stringify(parsed, null, 2);
  return { messageId: latest.messageId, oldPayload: latest.payload, newPayload };
}

function commitForcedConception(chatId: string, plan: ConceptionMutation): void {
  const history = chatTrackerHistory.get(chatId);
  if (!history) return;
  const idx = history.findIndex((entry) => entry.messageId === plan.messageId);
  if (idx === -1) return;
  history[idx] = { ...history[idx], payload: plan.newPayload };
}

/**
 * Rewrite any retained message whose visible tracker payload matches
 * `oldPayload` so it carries `newPayload` instead. Preserves the
 * surrounding tag/fence wrapper. Operates on the interceptor's in-memory
 * messages array; does not touch persisted chat state.
 */
function rewriteTrackerInMessages(
  messages: Array<{ content?: unknown }>,
  oldPayload: string,
  newPayload: string,
): void {
  const oldTrim = oldPayload.trim();
  if (!oldTrim || oldTrim === newPayload.trim()) return;
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    if (!msg || typeof msg.content !== "string") continue;
    const found = extractTrackerPayloadFromMessage(msg.content);
    if (!found || found.trim() !== oldTrim) continue;
    messages[i] = { ...msg, content: msg.content.replace(oldPayload, newPayload) };
  }
}

/**
 * Build a concise system-message directive that tells the LLM which
 * characters have had their seed take root.  The LLM is expected to
 * respond by setting `conceived: true` (and optionally `conception_date`)
 * on the next tracker emission.
 */
function buildConceptionDirective(names: string[]): string {
  if (names.length === 0) return "";
  const subject = names.length === 1 ? names[0] : names.join(", ");
  const verb = names.length === 1 ? "has" : "have";
  const pronoun = names.length === 1 ? "her" : "them";
  return `CONCEPTION DIRECTIVE: ${subject} ${verb} conceived. The prior tracker has been updated in-place to reflect this — \`conceived: true\` with \`conception_date\` set. PRESERVE this state on the next tracker emission; do not revert ${pronoun} to \`conceived: false\`. Do NOT set \`preg: true\` yet; that transition happens later as the narrative reveals the pregnancy.`;
}

const CERVIX_STATE_BY_ID: Record<number, string> = {
  0: "",
  1: "sealed",
  2: "firm",
  3: "soft",
  4: "open",
  5: "dilated",
  6: "kissed",
};

function cervixStateLabel(stats: CharacterStats): string {
  const id = Number(stats.cervix_state_id || stats.cervixStateId || 0);
  if (CERVIX_STATE_BY_ID[id]) return CERVIX_STATE_BY_ID[id];
  const legacy = typeof stats.cervix_state === "string" ? stats.cervix_state.toLowerCase() : "";
  return legacy;
}

function parseTrackerPayload(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/([\s:[,{])\+(\d+(?:\.\d+)?)([\s,}\]\n\r]|$)/g, "$1$2$3");
  if (!cleaned) return null;
  try {
    const json = JSON.parse(cleaned) as unknown;
    if (json && typeof json === "object") return json as Record<string, unknown>;
  } catch {
    // Try YAML next.
  }
  try {
    const yaml = parseYaml(cleaned) as unknown;
    if (yaml && typeof yaml === "object") return yaml as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function setDeep(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return;

  let cursor: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const existing = cursor[key];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

/**
 * Pick the example value for a custom field that will be baked into the
 * `{{sim_format}}` example block the LLM sees. The chosen value is what
 * the model imitates, so its JSON type matters — if a numeric enum like
 * `last_react` gets the default `""` fallback, the model emits
 * `"last_react": "0"` (a quoted string) instead of `"last_react": 0`.
 *
 * Resolution order, first match wins:
 *   1. Explicit type marker in the description, e.g. `[number]`,
 *      `(number)`, `[boolean]`, `[string]`, `[array]`. Template authors
 *      can force a type regardless of what the heuristic would guess.
 *   2. Well-known special-purpose keys (`name`, `*date*`, `*time*`,
 *      `bg`/`color`).
 *   3. Enum-style descriptions with `<digit>=<label>` pairs
 *      (`"0=Neutral, 1=Like"`). These are numeric codes — never strings.
 *   4. Numeric range descriptions (`(0-200)`, `(-100 to 100)`).
 *   5. Exact-match boolean keys (`preg`, `inactive`, `alive`) and
 *      descriptions explicitly calling out `true/false` / `boolean`.
 *      Exact-match is critical here so compound keys like `days_preg`
 *      and `inactiveReason` are NOT classified as booleans.
 *   6. Plain short-text keys (`*icon*`, `*thought*`, `*status*`).
 *   7. Arrays — description mentions "array" or the connection shape.
 *   8. Numeric key signals (game-stat abbreviations and domain terms
 *      such as `react`, `reason`, `index`, `days`, `level`).
 *   9. Plural keys → arrays as a final guess.
 *   10. Fallback to empty string.
 */
function inferExampleValue(key: string, description: string): unknown {
  const k = key.toLowerCase();
  const d = description.toLowerCase();

  // 1. Well-known special-purpose keys first so their informative
  //    placeholders (`"YYYY-MM-DD"`, `"HEX_COLOR"`) aren't overwritten
  //    by a generic empty-string default when the template author adds
  //    a `[string]` type marker to the same field.
  if (k === "name") return "Character Name";
  if (k.includes("date") && k.includes("time")) return "YYYY-MM-DD HH:MM";
  if (k.includes("date")) return "YYYY-MM-DD";
  if (k.includes("time")) return "HH:MM";
  if (k.includes("bg") || k.includes("color")) return "HEX_COLOR";

  // 2. Explicit type hints in the description override the remaining
  //    heuristics. Supported markers: `[number]`, `[integer]`, `[int]`,
  //    `[float]`, `[boolean]`, `[bool]`, `[string]`, `[text]`,
  //    `[array]`, `[list]`, and the `(...)` parenthesised variants.
  if (/[\[(](?:number|integer|int|float)[\])]/.test(d)) return 0;
  if (/[\[(](?:boolean|bool)[\])]/.test(d)) return false;
  if (/[\[(](?:string|text)[\])]/.test(d)) return "";
  if (/[\[(](?:array|list)[\])]/.test(d)) {
    if (k.includes("connection")) return [{ name: "Target", affinity: 0 }];
    return [];
  }

  // 3. Enum-style descriptions: "0=Neutral, 1=Like, 2=Dislike". These
  //    are numeric codes, NOT strings — that's the whole point of this
  //    rewrite. Must be detected before any string / boolean fallback.
  if (/\b\d+\s*=/.test(d)) return 0;

  // 4. Numeric range descriptions: "(0-200)", "(-100 to 100)",
  //    "(0 to 100)", "(1 - 20)". Any two numbers separated by a dash or
  //    the word "to" marks the field as numeric.
  if (/-?\d+\s*(?:to|[-–—])\s*-?\d+/.test(d)) return 0;

  // 5. Booleans — use EXACT key matches so compound keys like
  //    `days_preg` (count of days) and `inactiveReason` (enum code)
  //    aren't mis-classified as booleans.
  if (k === "preg" || k === "inactive" || k === "alive" || k === "dead") return false;
  if (/\btrue\/false\b|\bboolean\b/.test(d)) return false;

  // 6. Plain short-text keys.
  if (k.includes("icon") || k.includes("thought") || k.includes("status")) return "";

  // 7. Arrays.
  if (d.includes("array") || d.includes("[{")) {
    if (k.includes("connection")) return [{ name: "Target", affinity: 0 }];
    return [];
  }

  // 8. Numeric-leaning key patterns. Explicitly includes `react` and
  //    `reason` so `last_react` and `inactiveReason` are caught even
  //    without enum syntax in the description.
  const numericKeySignals = [
    "ap", "dp", "tp", "cp", "hp", "mp", "xp", "sp",
    "affection", "desire", "trust", "contempt", "affinity",
    "health", "vitality", "level", "turn", "count",
    "days", "months", "years", "hours", "minutes",
    "score", "points", "rating", "index",
    "react", "reason",
  ];
  if (numericKeySignals.some((term) => k.includes(term))) return 0;
  if (d.includes("number")) return 0;

  // 9. Plural key → array (weak signal; ignore common non-plural
  //    endings like `-us`, `-ss`, `-is`).
  if (k.endsWith("s") && !k.endsWith("us") && !k.endsWith("ss") && !k.endsWith("is")) {
    if (k.includes("connection")) return [{ name: "Target", affinity: 0 }];
    return [];
  }

  return "";
}

function buildTemplateExampleData(): Record<string, unknown> {
  const preset = getActivePreset();
  const fields = Array.isArray(preset.customFields) ? preset.customFields : [];
  const worldData: Record<string, unknown> = {
    current_date: "YYYY-MM-DD",
    current_time: "HH:MM",
  };
  const character: Record<string, unknown> = {
    name: "Character Name",
  };

  for (const field of fields) {
    const key = typeof field?.key === "string" ? field.key.trim() : "";
    if (!key) continue;
    const description = typeof field?.description === "string" ? field.description : "";
    const sample = inferExampleValue(key, description);

    if (key.startsWith("worldData.")) {
      setDeep(worldData, key.slice("worldData.".length), sample);
      continue;
    }
    const normalizedKey = key.replace(/^character\./i, "").replace(/^characters\[\]\./i, "");
    if (!normalizedKey || normalizedKey.toLowerCase() === "name") continue;
    setDeep(character, normalizedKey, sample);
  }

  return {
    worldData,
    characters: [character],
  };
}

function buildExampleTrackerBlock(format: "json" | "yaml", identifier: string): string {
  const data = buildTemplateExampleData();
  return formatTrackerPayload(data, format, identifier);
}

function formatTrackerPayload(data: Record<string, unknown>, format: "json" | "yaml", identifier: string): string {
  const tagName = sanitizeTagName(config.trackerTagName);
  const safeIdentifier = sanitizeIdentifier(identifier);
  const body = format === "yaml" ? stringifyYaml(data).trimEnd() : JSON.stringify(data, null, 2);
  return `<${tagName} type="${safeIdentifier}">\n${body}\n</${tagName}>`;
}

function buildCommandResponse(payload: CommandResultPayload): { type: string; payload: CommandResultPayload } {
  return {
    type: "command_result",
    payload,
  };
}

function makeStarterTrackerBlock(): string {
  return buildExampleTrackerBlock(config.trackerFormat, config.codeBlockIdentifier);
}

function replaceTrackerBlock(content: string, identifier: string, replacementBlock: string): string {
  const tagRe = buildTrackerTagRegex(config.trackerTagName, "ig");
  const desiredType = sanitizeIdentifier(identifier);
  let replaced = false;
  const withTag = content.replace(tagRe, (full, attrsRaw) => {
    const attrs = parseTagAttributes(String(attrsRaw || ""));
    const foundType = sanitizeIdentifier(attrs.type || "");
    if (foundType && foundType !== desiredType) return full;
    if (replaced) return full;
    replaced = true;
    return replacementBlock;
  });
  if (replaced) return withTag;

  const re = buildTrackerFenceRegex(identifier, "i");
  return withTag.replace(re, replacementBlock);
}

async function mutateChatForCommand(
  command: "/sst-add" | "/sst-convert" | "/sst-regen",
  arg1: string | undefined,
  ctx: MessageContext,
): Promise<CommandResultPayload | null> {
  if (!hasPermission("chat_mutation") || !ctx.chatId) return null;

  let messages: Array<{ id: string; role: "system" | "user" | "assistant"; content: string }> = [];
  try {
    messages = await spindle.chat.getMessages(ctx.chatId);
  } catch {
    return null;
  }

  let latestTrackerMessage: { id: string; role: "system" | "user" | "assistant"; content: string } | null = null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (extractTrackerPayloadFromMessage(msg.content)) {
      latestTrackerMessage = msg;
      break;
    }
  }

  if (command === "/sst-add") {
    const target = messages.findLast((msg) => msg.role === "assistant") || null;
    if (!target) {
      return {
        command: "sst-add",
        ok: false,
        message: "No assistant message found to append tracker tag.",
        mode: "chat_mutation",
      };
    }
    if (extractTrackerPayloadFromMessage(target.content)) {
      return {
        command: "sst-add",
        ok: false,
        message: "Latest assistant message already contains a tracker tag.",
        mode: "chat_mutation",
      };
    }
    const block = makeStarterTrackerBlock();
    const updatedContent = `${target.content.trimEnd()}\n\n${block}`;
    await spindle.chat.updateMessage(ctx.chatId, target.id, { content: updatedContent });
    await trackEvent("sst.command.add", { mode: "chat_mutation" }, { chatId: ctx.chatId });
    return {
      command: "sst-add",
      ok: true,
      message: "Added starter tracker tag to latest assistant message.",
      block,
      mode: "chat_mutation",
    };
  }

  if (!latestTrackerMessage) {
    return {
      command: command.replace("/", ""),
      ok: false,
      message: "No tracker tag found in current chat.",
      mode: "chat_mutation",
    };
  }

  const raw = extractTrackerPayloadFromMessage(latestTrackerMessage.content);
  if (!raw) {
    return {
      command: command.replace("/", ""),
      ok: false,
      message: "Latest tracker tag could not be read.",
      mode: "chat_mutation",
    };
  }

  const parsed = parseTrackerPayload(raw);
  if (!parsed) {
    return {
      command: command.replace("/", ""),
      ok: false,
      message: "Latest tracker tag is invalid and cannot be rewritten.",
      mode: "chat_mutation",
    };
  }

  const targetFormat = command === "/sst-convert"
    ? arg1 === "yaml"
      ? "yaml"
      : arg1 === "json"
        ? "json"
        : config.trackerFormat
    : config.trackerFormat;

  const replacement = formatTrackerPayload(parsed, targetFormat, config.codeBlockIdentifier);
  const updatedContent = replaceTrackerBlock(latestTrackerMessage.content, config.codeBlockIdentifier, replacement);
  await spindle.chat.updateMessage(ctx.chatId, latestTrackerMessage.id, { content: updatedContent });

  lastSimStats = targetFormat === "yaml" ? stringifyYaml(parsed) : JSON.stringify(parsed, null, 2);
  pushMacroValues();
  await trackEvent(
    command === "/sst-convert" ? "sst.command.convert" : "sst.command.regen",
    { mode: "chat_mutation", format: targetFormat },
    { chatId: ctx.chatId },
  );

  return {
    command: command.replace("/", ""),
    ok: true,
    message:
      command === "/sst-convert"
        ? `Converted latest tracker to ${targetFormat.toUpperCase()} and updated chat message.`
        : "Rebuilt latest tracker tag in preferred format and updated chat message.",
    block: replacement,
    mode: "chat_mutation",
  };
}

async function handleSlashCommand(content: string, ctx: MessageContext): Promise<{ type: string; payload: CommandResultPayload } | null> {
  const trimmed = content.trim();
  if (!trimmed.startsWith("/sst-")) return null;

  const [commandRaw, arg1] = trimmed.split(/\s+/);
  const command = commandRaw as "/sst-add" | "/sst-convert" | "/sst-regen";

  if (!["/sst-add", "/sst-convert", "/sst-regen"].includes(command)) {
    return buildCommandResponse({
      command: commandRaw.replace("/", ""),
      ok: false,
      message: "Unknown SST command. Supported: /sst-add, /sst-convert, /sst-regen",
      mode: "fallback",
    });
  }

  const chatResult = await mutateChatForCommand(command, arg1, ctx);
  if (chatResult) {
    return buildCommandResponse(chatResult);
  }

  if (command === "/sst-convert") {
    const target = arg1 === "yaml" ? "yaml" : arg1 === "json" ? "json" : config.trackerFormat;
    if (!lastSimStats || lastSimStats === "{}") {
      return buildCommandResponse({
        command: "sst-convert",
        ok: false,
        message: "No tracker tag found yet.",
        mode: "fallback",
      });
    }
    const parsed = parseTrackerPayload(lastSimStats);
    if (!parsed) {
      return buildCommandResponse({
        command: "sst-convert",
        ok: false,
        message: "Latest tracker tag is invalid and cannot be converted.",
        mode: "fallback",
      });
    }
    const block = formatTrackerPayload(parsed, target, config.codeBlockIdentifier);
    lastSimStats = target === "yaml" ? stringifyYaml(parsed) : JSON.stringify(parsed, null, 2);
    pushMacroValues();
    await trackEvent("sst.command.convert", { mode: "fallback", format: target }, ctx.chatId ? { chatId: ctx.chatId } : undefined);
    return buildCommandResponse({
      command: "sst-convert",
      ok: true,
      message: `Converted latest tracker to ${target.toUpperCase()}.`,
      block,
      mode: "fallback",
    });
  }

  if (command === "/sst-add") {
    const block = makeStarterTrackerBlock();
    await trackEvent("sst.command.add", { mode: "fallback" }, ctx.chatId ? { chatId: ctx.chatId } : undefined);
    return buildCommandResponse({
      command: "sst-add",
      ok: true,
      message: "Generated a starter tracker tag.",
      block,
      mode: "fallback",
    });
  }

  if (!lastSimStats || lastSimStats === "{}") {
    return buildCommandResponse({
      command: "sst-regen",
      ok: false,
      message: "No tracker tag to regenerate yet. Use /sst-add first.",
      mode: "fallback",
    });
  }
  const parsed = parseTrackerPayload(lastSimStats);
  if (!parsed) {
    return buildCommandResponse({
      command: "sst-regen",
      ok: false,
      message: "Latest tracker is invalid and cannot be regenerated.",
      mode: "fallback",
    });
  }
  const block = formatTrackerPayload(parsed, config.trackerFormat, config.codeBlockIdentifier);
  await trackEvent(
    "sst.command.regen",
    { mode: "fallback", format: config.trackerFormat },
    ctx.chatId ? { chatId: ctx.chatId } : undefined,
  );
  return buildCommandResponse({
    command: "sst-regen",
    ok: true,
    message: "Rebuilt latest tracker tag in preferred format.",
    block,
    mode: "fallback",
  });
}

function stripOldTrackerBlocks(content: string, identifier: string, keepNewest: number): string {
  if (!content || keepNewest < 0) return content;
  const fenceRe = buildTrackerFenceRegex(identifier, "gi");
  const tagRe = buildTrackerTagRegex(config.trackerTagName, "gi");

  const blocks: Array<{ start: number; end: number; text: string }> = [];
  for (const match of content.matchAll(fenceRe)) {
    const text = match[0] || "";
    const start = match.index ?? -1;
    if (start < 0 || !text) continue;
    blocks.push({ start, end: start + text.length, text });
  }
  for (const match of content.matchAll(tagRe)) {
    const text = match[0] || "";
    const attrs = parseTagAttributes(match[1] || "");
    const foundType = sanitizeIdentifier(attrs.type || "");
    const desiredType = sanitizeIdentifier(identifier);
    if (foundType && foundType !== desiredType) continue;
    const start = match.index ?? -1;
    if (start < 0 || !text) continue;
    blocks.push({ start, end: start + text.length, text });
  }

  blocks.sort((a, b) => a.start - b.start);
  const matches = blocks;
  if (matches.length <= keepNewest || keepNewest === 0) {
    if (keepNewest === 0) {
      let wiped = content.replace(fenceRe, "");
      wiped = wiped.replace(tagRe, (full, attrsRaw) => {
        const attrs = parseTagAttributes(String(attrsRaw || ""));
        const foundType = sanitizeIdentifier(attrs.type || "");
        const desiredType = sanitizeIdentifier(identifier);
        if (foundType && foundType !== desiredType) return full;
        return "";
      });
      return wiped.replace(/\n\s*\n\s*\n/g, "\n\n").trim();
    }
    return content;
  }

  const removeCount = matches.length - keepNewest;
  const removeIndexes = new Set<number>();
  for (let i = 0; i < removeCount; i += 1) removeIndexes.add(i);

  let out = "";
  let cursor = 0;
  for (let i = 0; i < matches.length; i += 1) {
    const block = matches[i];
    out += content.slice(cursor, block.start);
    if (!removeIndexes.has(i)) out += block.text;
    cursor = block.end;
  }
  out += content.slice(cursor);
  return out.replace(/\n\s*\n\s*\n/g, "\n\n").trim();
}

async function loadConfig(): Promise<void> {
  const userId = activeUserId;
  try {
    const parsed = await spindle.userStorage.getJson<Partial<TrackerConfig>>(CONFIG_PATH, { fallback: { ...DEFAULT_CONFIG }, userId: userId || undefined });
    config = {
      trackerTagName: sanitizeTagName(parsed.trackerTagName),
      codeBlockIdentifier: sanitizeIdentifier(parsed.codeBlockIdentifier),
      hideSimBlocks: sanitizeBool(parsed.hideSimBlocks, DEFAULT_CONFIG.hideSimBlocks),
      templateId: sanitizeTemplateId(parsed.templateId),
      trackerFormat: sanitizeTrackerFormat(parsed.trackerFormat),
      retainTrackerCount: sanitizeRetainCount(parsed.retainTrackerCount),
      enableInlineTemplates: sanitizeInlineEnabled(parsed.enableInlineTemplates),
      userPresets: sanitizePresetArray(parsed.userPresets),
      inlinePacks: sanitizeInlinePacks(parsed.inlinePacks),
      useSecondaryLLM: sanitizeBool(parsed.useSecondaryLLM, DEFAULT_CONFIG.useSecondaryLLM),
      secondaryLLMConnectionId: sanitizeStr(parsed.secondaryLLMConnectionId, DEFAULT_CONFIG.secondaryLLMConnectionId),
      secondaryLLMModel: sanitizeSecondaryLLMModel(parsed.secondaryLLMModel, DEFAULT_CONFIG.secondaryLLMModel),
      secondaryLLMMessageCount: sanitizeMessageCount(parsed.secondaryLLMMessageCount),
      secondaryLLMTemperature: sanitizeTemperature(parsed.secondaryLLMTemperature),
      secondaryLLMStripHTML: sanitizeBool(parsed.secondaryLLMStripHTML, DEFAULT_CONFIG.secondaryLLMStripHTML),
    };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
  loadedConfigUserId = userId;
  pushMacroValues();
}

async function ensureConfigForUser(userId?: string | null): Promise<void> {
  if (!userId) return;
  if (activeUserId === userId && loadedConfigUserId === userId) return;
  activeUserId = userId;
  await loadConfig();
}

async function loadSeededTemplatePresets(): Promise<void> {
  const seeded: TemplatePreset[] = [];
  try {
    const templatesRoot = "templates";
    const hasTemplatesDir = await spindle.storage.exists(templatesRoot);
    if (!hasTemplatesDir) {
      runtime.seededPresets = [];
      return;
    }

    const visited = new Set<string>();
    const jsonPaths = new Set<string>();

    const toStoragePath = (entry: string, base: string): string => {
      const normalized = entry.replace(/^\/+/, "").replace(/\\/g, "/");
      if (!normalized) return base;
      if (normalized === base || normalized.startsWith(`${base}/`)) return normalized;
      return `${base}/${normalized}`;
    };

    const walk = async (dirPath: string): Promise<void> => {
      if (visited.has(dirPath)) return;
      visited.add(dirPath);

      const entries = await spindle.storage.list(dirPath);
      for (const entry of entries) {
        const fullPath = toStoragePath(entry, dirPath);
        try {
          const stat = await spindle.storage.stat(fullPath);
          if (!stat.exists) continue;
          if (stat.isDirectory) {
            await walk(fullPath);
            continue;
          }
          if (stat.isFile && fullPath.toLowerCase().endsWith(".json")) {
            jsonPaths.add(fullPath);
          }
        } catch {
          // Ignore unreadable path and continue traversal.
        }
      }
    };

    await walk(templatesRoot);

    for (const path of jsonPaths) {
      try {
        const stat = await spindle.storage.stat(path);
        if (!stat.exists || !stat.isFile) continue;
        const fileName = path.split("/").pop() || "seeded-template";
        const fileId = fileName.replace(/\.json$/i, "").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
        const parsed = await spindle.storage.getJson<Record<string, unknown>>(path, { fallback: {} });
        const preset = sanitizeSinglePreset(parsed, fileId);
        if (preset && preset.htmlTemplate) {
          seeded.push(preset);
        }
      } catch {
        // Skip invalid seed files.
      }
    }
  } catch {
    // Ignore seed loading failures and continue with bundled presets.
  }

  runtime.seededPresets = seeded;
}

async function saveConfig(): Promise<void> {
  await spindle.userStorage.setJson(CONFIG_PATH, config, { indent: 2, userId: activeUserId || undefined });
  if (activeUserId) {
    try {
      await spindle.userStorage.setJson(CONFIG_PATH, config, { indent: 2 });
    } catch {
      // The user-scoped write above is authoritative; the unscoped copy is only a startup fallback.
    }
  }
}

spindle.on("MESSAGE_SENT", (payload: unknown, userId?: string) => {
  void (async () => {
    await ensureConfigForUser(userId);
    const ctx = readMessageContext(payload);
    const message = ctx.content;
    if (typeof message !== "string") return;

    if (ctx.chatId) {
      activeChatId = ctx.chatId;
      void rehydrateChatTrackerHistory(ctx.chatId);
    }

    const commandResult = await handleSlashCommand(message, ctx);
    if (commandResult) {
      spindle.sendToFrontend(commandResult, activeUserId || undefined);
      await trackEvent(
        "sst.command.result",
        {
          command: commandResult.payload.command,
          ok: commandResult.payload.ok,
          mode: commandResult.payload.mode || "fallback",
        },
        ctx.chatId ? { chatId: ctx.chatId } : undefined,
      );
    }

    const sim = extractTrackerPayloadFromMessage(message);
    if (sim) {
      lastSimStats = sim;
      recordChatTracker(ctx.chatId, ctx.messageId, sim);
      pushMacroValues();
      await trackEvent("sst.tracker.detected", { identifier: config.codeBlockIdentifier }, ctx.chatId ? { chatId: ctx.chatId } : undefined);
    }
  })();
});

spindle.on("MESSAGE_EDITED", (payload: unknown, userId?: string) => {
  void (async () => {
    await ensureConfigForUser(userId);
    const ctx = readMessageContext(payload);
    if (ctx.chatId) activeChatId = ctx.chatId;
    if (typeof ctx.content !== "string") return;
    const sim = extractTrackerPayloadFromMessage(ctx.content);
    if (sim) {
      lastSimStats = sim;
      recordChatTracker(ctx.chatId, ctx.messageId, sim);
      pushMacroValues();
      await trackEvent("sst.tracker.detected", { identifier: config.codeBlockIdentifier, source: "message_edited" }, ctx.chatId ? { chatId: ctx.chatId } : undefined);
      return;
    }
    // Edit removed the tracker (e.g. swipe to a variant without one) — drop
    // the side-channel entry so stale data doesn't leak into generation.
    forgetChatTracker(ctx.chatId, ctx.messageId);
  })();
});

spindle.on("MESSAGE_SWIPED", (payload: unknown, userId?: string) => {
  void (async () => {
    await ensureConfigForUser(userId);
    if (!payload || typeof payload !== "object") return;
    const obj = payload as Record<string, unknown>;

    const chatId = typeof obj.chatId === "string" ? obj.chatId : null;
    if (chatId) activeChatId = chatId;
    const message = obj.message && typeof obj.message === "object"
      ? (obj.message as Record<string, unknown>)
      : null;
    if (!chatId || !message) return;

    const messageId = typeof message.id === "string" ? message.id : null;
    if (!messageId) return;

    const action = typeof obj.action === "string" ? obj.action : "";
    const activeSwipeId = typeof message.swipe_id === "number" ? message.swipe_id : 0;

    // Determine which swipe's content is authoritative for this event.
    //   - added     : the new swipe, which is `swipes[swipe_id]` (usually the
    //                 one just created). `content` mirrors it.
    //   - updated   : the edited swipe. If the edited slot is the active one,
    //                 `content` reflects it; otherwise we still prefer the
    //                 active slot because that's what downstream generation
    //                 will actually see.
    //   - deleted   : `content` is the post-deletion active swipe.
    //   - navigated : `content` is the destination swipe.
    // In every case `message.content` (= `swipes[swipe_id]`) is the right
    // source, so we don't need to special-case per action.
    const activeContent = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.swipes) && typeof message.swipes[activeSwipeId] === "string"
        ? (message.swipes[activeSwipeId] as string)
        : "";

    const payloadText = extractTrackerPayloadFromMessage(activeContent);
    if (payloadText) {
      // Re-sync the side-channel to the currently active swipe's tracker.
      // This is essential so that when the user cycles between swipe
      // variants, subsequent generations (main or secondary) reference the
      // tracker data that actually matches the on-screen narrative rather
      // than whichever variant was last recorded.
      recordChatTracker(chatId, messageId, payloadText);
      lastSimStats = payloadText;
      pushMacroValues();
    } else {
      // The active swipe has no tracker tag. Drop the side-channel entry
      // for this message so it isn't used as "prior state" for the next
      // generation. This also correctly handles the `added` case where a
      // brand-new swipe slot starts empty pending generation — by clearing
      // M(n)'s stale entry we guarantee the new generation references the
      // previous message's tracker, not the previous swipe's.
      forgetChatTracker(chatId, messageId);
    }

    await trackEvent(
      "sst.swipe.synced",
      { action, swipeId: typeof obj.swipeId === "number" ? obj.swipeId : null },
      { chatId },
    );
  })();
});

spindle.on("MESSAGE_TAG_INTERCEPTED", (payload: unknown, userId?: string) => {
  void (async () => {
    await ensureConfigForUser(userId);
    if (!payload || typeof payload !== "object") return;
    const obj = payload as Record<string, unknown>;
    const tagName = typeof obj.tagName === "string" ? sanitizeTagName(obj.tagName) : "";
    if (tagName !== sanitizeTagName(config.trackerTagName)) return;

    const attrs = obj.attrs && typeof obj.attrs === "object" ? (obj.attrs as Record<string, unknown>) : {};
    const tagType = sanitizeIdentifier(typeof attrs.type === "string" ? attrs.type : "");
    if (tagType && tagType !== sanitizeIdentifier(config.codeBlockIdentifier)) return;

    const content = typeof obj.content === "string" ? obj.content.trim() : "";
    if (!content) return;

    const isStreaming = obj.isStreaming === true;
    // Skip mid-stream fragments — they're usually incomplete tracker payloads
    // and would overwrite the last good record with a partial one. The final
    // completed tag is delivered with isStreaming=false (or via MESSAGE_SENT /
    // MESSAGE_EDITED as a fallback).
    if (isStreaming) return;

    const chatId = typeof obj.chatId === "string" ? obj.chatId : null;
    const messageId = typeof obj.messageId === "string" ? obj.messageId : null;
    if (chatId) activeChatId = chatId;

    lastSimStats = content;
    recordChatTracker(chatId, messageId, content);
    pushMacroValues();
    await trackEvent("sst.tracker.detected", { identifier: config.codeBlockIdentifier, source: "message_tag_intercepted" });
  })();
});

spindle.registerMacro({
  name: "sim_format",
  category: "extension:silly_sim_tracker",
  description: "Example tracker tag format",
  returnType: "string",
  handler: "",
});

spindle.registerMacro({
  name: "sim_tracker",
  category: "extension:silly_sim_tracker",
  description: "Main tracker instructions for the active template",
  returnType: "string",
  handler: "",
});

spindle.registerMacro({
  name: "last_sim_stats",
  category: "extension:silly_sim_tracker",
  description: "The latest raw tracker block seen in chat",
  returnType: "string",
  handler: "",
});

/**
 * Rewrite any instructions in the preset's sysPrompt that would lead the
 * LLM to emit a markdown code fence (e.g. ```sim ... ```) for tracker
 * data. The frontend's MESSAGE_TAG_INTERCEPTED path only fires on the
 * configured XML tag, so a fenced block silently bypasses tracker
 * capture, side-channel history, and secondary-LLM plumbing.
 *
 * Three passes, each targeting a different way the fence format leaks in:
 *   1. `\`\`\`<identifier> ... \`\`\`` fences — authors copy/paste these
 *      as literal examples. Rewritten as the XML wrapper so the example
 *      still shows the intended shape but in the correct format.
 *   2. `\`\`\`json` / `\`\`\`yaml` fences whose body looks like a tracker
 *      payload (references `worldData` / `characters` / a `"name"` key).
 *      Non-tracker code examples are left alone.
 *   3. Textual references like ``\`sim\` codeblock``, `Sim codeblock`,
 *      `DISP code block` — replaced with the tracker-tag terminology.
 */
function sanitizeSysPromptForWireFormat(base: string, tagName: string, identifier: string): string {
  if (!base) return base;
  const safeTag = sanitizeTagName(tagName);
  const safeId = sanitizeIdentifier(identifier);
  const idEsc = escapeRegex(safeId);
  const wrap = (body: string) => `<${safeTag} type="${safeId}">\n${body.trim()}\n</${safeTag}>`;

  // Pass 1: identifier-tagged fences. Case-insensitive so `\`\`\`SIM` and
  // `\`\`\`sim` both match.
  const idFenceRe = new RegExp(
    String.raw`\`\`\`[ \t]*${idEsc}\b[^\n]*\r?\n([\s\S]*?)\r?\n?[ \t]*\`\`\``,
    "gi",
  );
  let out = base.replace(idFenceRe, (_m, body: string) => wrap(body));

  // Pass 2: json/yaml fences that actually contain tracker data. The
  // heuristic is deliberately conservative to avoid rewriting unrelated
  // JSON snippets that may appear in docs-heavy presets.
  const dataFenceRe = /```[ \t]*(?:json|yaml|yml)\b[^\n]*\r?\n([\s\S]*?)\r?\n?[ \t]*```/gi;
  out = out.replace(dataFenceRe, (match, body: string) => {
    const looksLikeTracker = /\bworldData\b|\bcharacters?\b|"name"\s*:/.test(body);
    return looksLikeTracker ? wrap(body) : match;
  });

  // Pass 3: textual references. Matches `\`sim\` codeblock`, `sim
  // codeblocks`, `Sim code block`, etc. — anything where the identifier
  // (optionally backticked) is followed by the word "codeblock" or
  // "code block" (plural/singular).
  const textRe = new RegExp(
    String.raw`\`?${idEsc}\`?[ \t]*code[ \t-]*block(?:s)?`,
    "gi",
  );
  out = out.replace(textRe, `${safeTag} tag`);

  return out;
}

/**
 * Push current macro values to the host so prompt assembly can resolve
 * them instantly without an RPC roundtrip to the worker.
 */
function pushMacroValues(): void {
  // sim_format
  const fmt = buildExampleTrackerBlock(config.trackerFormat, config.codeBlockIdentifier);
  spindle.updateMacroValue("sim_format", fmt);

  // sim_tracker — always resolve the *active* preset (built-in, seeded,
  // or user-imported) so switching the template dropdown actually swaps
  // the prompt the LLM sees. A static id→prompt map here previously
  // ignored anything outside the bundled defaults.
  const tag = sanitizeTagName(config.trackerTagName);
  const id = sanitizeIdentifier(config.codeBlockIdentifier);
  const rawBase = getActivePreset().sysPrompt || "";
  const base = sanitizeSysPromptForWireFormat(rawBase, tag, id);
  const directive = [
    "IMPORTANT OUTPUT FORMAT:",
    "Do not emit markdown code fences for tracker data.",
    "Emit a single XML block using this exact wrapper:",
    `<${tag} type="${id}">`,
    "{...tracker JSON or YAML...}",
    `</${tag}>`,
    "Narrative text must remain outside the tracker tag.",
  ].join("\n");
  const simTracker = base
    ? directive + "\n\n" + base.replace(/\{\{sim_format\}\}/g, fmt)
    : directive + "\n\n" + fmt;
  spindle.updateMacroValue("sim_tracker", simTracker);

  // last_sim_stats
  spindle.updateMacroValue("last_sim_stats", lastSimStats || "{}");
}

// ── Secondary LLM Generation ─────────────────────────────────────────
//
// We run at most one secondary generation at a time per backend, serialized
// through a Promise chain. Earlier versions used a `secondaryGenerationInProgress`
// flag that caused `GENERATION_ENDED` to *drop* subsequent requests if a
// previous secondary was still in flight — the visible symptom was "the last
// message sometimes doesn't get a tracker" when the user replied faster than
// the sidecar could finish.
let secondaryGenerationChain: Promise<void> = Promise.resolve();
const queuedSecondaryJobs = new Set<string>();

function enqueueSecondaryGeneration(chatId: string, messageId: string): Promise<void> {
  const key = `${chatId}::${messageId}`;
  // Drop duplicate requests for the same (chat, message) while one is queued.
  // The in-flight job's pre-flight `extractTrackerPayloadFromMessage` check
  // would no-op anyway once the first run finishes, so this is just hygiene.
  if (queuedSecondaryJobs.has(key)) return secondaryGenerationChain;
  queuedSecondaryJobs.add(key);
  secondaryGenerationChain = secondaryGenerationChain
    .catch(() => undefined)
    .then(() => generateTrackerWithSecondaryLLM(chatId, messageId))
    .catch((err) => {
      spindle.log.error(`Queued secondary LLM generation failed: ${err instanceof Error ? err.message : String(err)}`);
    })
    .finally(() => {
      queuedSecondaryJobs.delete(key);
    });
  return secondaryGenerationChain;
}

function stripStructuralHTML(text: string): string {
  if (!text) return text;
  const tagsToRemove = [
    "div", "details", "summary", "section", "article", "aside", "nav",
    "header", "footer", "main", "figure", "figcaption", "blockquote",
    "pre", "code", "script", "style", "iframe", "object", "embed",
  ];
  let stripped = text;
  for (const tag of tagsToRemove) {
    stripped = stripped.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), "");
    stripped = stripped.replace(new RegExp(`<${tag}[^>]*\\/>`, "gi"), "");
  }
  return stripped.replace(/\s+/g, " ").trim();
}

// Provider placeholder values that look like a real model field but aren't.
// Spindle's connection-profile UI seeds the model textbox with "string" as a
// schema placeholder; if the user enables the secondary LLM without filling
// that in, the request hits the provider with model:"string" and 400s.
const SECONDARY_LLM_MODEL_PLACEHOLDERS = new Set(["", "string", "model", "your-model-here", "null", "undefined"]);

function describeMissingModelGuidance(): string {
  return "Secondary LLM model is not configured. Open SimTracker settings → Secondary LLM and enter a real model id (e.g. `gpt-4o-mini`, `claude-haiku-4-5`, `deepseek-chat`). The provider rejected the request because the model field was empty or a placeholder.";
}

function describeRejectedModelGuidance(model: string): string {
  return `The provider rejected the configured model id \`${model}\`. Open SimTracker settings → Secondary LLM and confirm the override matches a model this connection can serve, or clear the override to fall back to the connection's default.`;
}

async function generateTrackerWithSecondaryLLM(chatId: string, targetMessageId: string): Promise<void> {
  if (!config.useSecondaryLLM) return;
  if (!hasPermission("generation")) {
    spindle.log.warn("Secondary LLM generation requires 'generation' permission");
    return;
  }
  if (!hasPermission("chat_mutation")) {
    spindle.log.warn("Secondary LLM generation requires 'chat_mutation' permission");
    return;
  }
  // Without `generation_parameters`, Spindle silently strips `parameters`
  // from the outgoing request — including our model override. The provider
  // then receives the connection's stored model (often the seed `"string"`)
  // and 400s. Bail loudly here so the user knows to grant the permission.
  if (!hasPermission("generation_parameters")) {
    const guidance = "Secondary LLM generation requires the 'generation_parameters' permission so the configured model id reaches the provider. Grant it in SimTracker's permission prompt and try again.";
    spindle.log.warn(guidance);
    spindle.sendToFrontend(
      { type: "secondary_generation_error", message: guidance, chatId, messageId: targetMessageId },
      activeUserId || undefined,
    );
    return;
  }

  // ── Pre-flight: validate model & connection ───────────────────────────
  // The provider call requires a non-empty, non-placeholder model id. If the
  // user enabled the sidecar without filling this in we bail early with a
  // clear error rather than emitting a 400 from the upstream API.
  const trimmedModel = (config.secondaryLLMModel || "").trim();
  if (SECONDARY_LLM_MODEL_PLACEHOLDERS.has(trimmedModel.toLowerCase())) {
    const guidance = describeMissingModelGuidance();
    spindle.log.warn(guidance);
    spindle.sendToFrontend(
      { type: "secondary_generation_error", message: guidance, chatId, messageId: targetMessageId },
      activeUserId || undefined,
    );
    return;
  }

  spindle.sendToFrontend(
    { type: "secondary_generation_started", chatId, messageId: targetMessageId },
    activeUserId || undefined,
  );

  try {
    // Ensure the side-channel history is primed for this chat before we
    // rely on it. Safe to call repeatedly — rehydration is idempotent.
    await rehydrateChatTrackerHistory(chatId);

    const messages = await spindle.chat.getMessages(chatId);
    if (!messages.length) return;

    const targetMessage = messages.find((m) => m.id === targetMessageId);
    if (!targetMessage || targetMessage.role !== "assistant") return;
    if (extractTrackerPayloadFromMessage(targetMessage.content)) return;

    const preset = getActivePreset();
    const systemPrompt = preset.sysPrompt || "";
    const formatExample = buildExampleTrackerBlock(config.trackerFormat, config.codeBlockIdentifier);
    let processedPrompt = systemPrompt.replace(/\{\{sim_format\}\}/g, formatExample);

    const tagName = sanitizeTagName(config.trackerTagName);
    const identifier = config.codeBlockIdentifier;
    const messageCount = config.secondaryLLMMessageCount;

    const recentMessages = messages
      .filter((m) => m.role !== "system")
      .slice(-messageCount);

    // ── Historical tracker progression ────────────────────────────────
    //
    // Pull the most recent historical trackers so the secondary LLM can
    // see how the state has been evolving rather than only the single
    // latest value. The side-channel history is the primary source
    // (survives `removeFromMessage`) with a full-chat scan as a fallback
    // in case events were missed or the extension was reloaded.
    //
    // Honour the user's "Retain N trackers" setting exactly: 0 means no
    // prior context, anything ≥1 caps at 10 to keep the prompt bounded.
    const retainSetting = Number.isFinite(config.retainTrackerCount) ? config.retainTrackerCount : 3;
    const historyLimit = Math.max(0, Math.min(10, retainSetting));
    let historicalTrackers = historyLimit === 0
      ? []
      : getRecentChatTrackers(chatId, historyLimit, targetMessageId).map((entry) => entry.payload);

    if (historyLimit > 0 && historicalTrackers.length === 0) {
      // Fallback: scan the entire chat (not just the recentMessages window)
      // for tracker blocks embedded in message content.
      const nonSystem = messages.filter((m) => m.role !== "system");
      const targetIdx = nonSystem.findIndex((m) => m.id === targetMessageId);
      const scanEnd = targetIdx >= 0 ? targetIdx : nonSystem.length;
      const found: string[] = [];
      for (let i = scanEnd - 1; i >= 0 && found.length < historyLimit; i -= 1) {
        const payload = extractTrackerPayloadFromMessage(nonSystem[i].content);
        if (payload) found.unshift(payload); // oldest → newest
      }
      historicalTrackers = found;
    }

    const tagRe = buildTrackerTagRegex(tagName, "ig");
    const fenceRe = buildTrackerFenceRegex(identifier, "gi");
    const cleanedMessages = recentMessages.map((msg) => {
      let content = msg.content;
      content = content.replace(tagRe, "").trim();
      content = content.replace(fenceRe, "").trim();
      if (config.secondaryLLMStripHTML) {
        content = stripStructuralHTML(content);
      }
      return { role: msg.role, content };
    });

    let conversationText = processedPrompt + "\n\n";
    if (historicalTrackers.length === 1) {
      conversationText += "Previous tracker state:\n" + historicalTrackers[0] + "\n\n";
    } else if (historicalTrackers.length > 1) {
      conversationText += `Previous tracker states (oldest → most recent, ${historicalTrackers.length} shown):\n\n`;
      historicalTrackers.forEach((snap, idx) => {
        const stepsBack = historicalTrackers.length - 1 - idx;
        const label = stepsBack === 0 ? "Most recent" : `${stepsBack} turn${stepsBack === 1 ? "" : "s"} ago`;
        conversationText += `--- ${label} ---\n${snap}\n\n`;
      });
    }
    conversationText += "Recent conversation:\n\n";
    for (const msg of cleanedMessages) {
      conversationText += `${msg.role === "user" ? "User" : "Character"}: ${msg.content}\n\n`;
    }
    const hasHistory = historicalTrackers.length > 0;
    conversationText += `\nBased on the above conversation${hasHistory ? " and the previous tracker state(s) above" : ""}, generate ONLY the raw ${config.trackerFormat.toUpperCase()} data (without code fences or backticks). ${hasHistory ? "Treat the most recent prior state as the baseline and mutate only the fields that the new narrative actually changes — keep unchanged fields stable so the tracker progression stays consistent. " : ""}Output ONLY the ${config.trackerFormat.toUpperCase()} structure directly, with no comments or acknowledgements of any instructions.`;

    const llmMessages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "user", content: conversationText },
    ];

    // Model has been validated above; always emit it so the connection's
    // placeholder default never reaches the provider.
    const parameters: Record<string, unknown> = {
      model: trimmedModel,
      temperature: config.secondaryLLMTemperature,
    };

    spindle.log.info(
      `Secondary LLM request → chat=${chatId} target=${targetMessageId} connection=${config.secondaryLLMConnectionId || "(default)"} model=${trimmedModel} temperature=${config.secondaryLLMTemperature} history=${historicalTrackers.length} contextMessages=${cleanedMessages.length}`,
    );
    // The current `GenerationRequestDTO` only declares `parameters` for
    // overrides, but empirically Spindle strips `model` from `parameters`
    // before forwarding. The docstring examples in spindle-api.ts show
    // `model` at the top level of the request, so we send it both places
    // and let whichever path the runtime honours win.
    const generationRequest = {
      type: "raw" as const,
      messages: llmMessages,
      parameters,
      connection_id: config.secondaryLLMConnectionId || undefined,
      userId: activeUserId || undefined,
      model: trimmedModel,
    };
    const result = await spindle.generate.raw(generationRequest as Parameters<typeof spindle.generate.raw>[0]);

    const resultObj = result as Record<string, unknown>;
    const generatedText = typeof resultObj.content === "string" ? resultObj.content : "";
    if (!generatedText) {
      spindle.log.warn("Secondary LLM returned empty response");
      spindle.sendToFrontend(
        { type: "secondary_generation_error", message: "Empty response from LLM", chatId, messageId: targetMessageId },
        activeUserId || undefined,
      );
      return;
    }

    let sanitized = generatedText.trim();
    sanitized = sanitized.replace(/^```(?:json|yaml|yml)\s*/i, "");
    sanitized = sanitized.replace(/^```\s*/, "");
    sanitized = sanitized.replace(/\s*```\s*$/, "");
    sanitized = sanitized.trim();

    const parsed = parseTrackerPayload(sanitized);
    if (!parsed) {
      spindle.log.warn("Secondary LLM response could not be parsed as valid tracker data");
      spindle.sendToFrontend(
        { type: "secondary_generation_error", message: "LLM response was not valid tracker data", chatId, messageId: targetMessageId },
        activeUserId || undefined,
      );
      return;
    }

    const trackerBlock = formatTrackerPayload(parsed, config.trackerFormat, config.codeBlockIdentifier);
    const updatedContent = `${targetMessage.content.trimEnd()}\n\n${trackerBlock}`;
    await spindle.chat.updateMessage(chatId, targetMessageId, { content: updatedContent });

    lastSimStats = config.trackerFormat === "yaml"
      ? stringifyYaml(parsed)
      : JSON.stringify(parsed, null, 2);
    // Record the freshly generated tracker in the side-channel so the next
    // secondary run sees it as "most recent" even if the frontend's
    // removeFromMessage strips it from canonical storage.
    recordChatTracker(chatId, targetMessageId, lastSimStats);
    pushMacroValues();

    spindle.log.info("Secondary LLM generation complete");
    await trackEvent("sst.secondary_generation.complete", {
      connectionId: config.secondaryLLMConnectionId,
      model: config.secondaryLLMModel,
    }, { chatId });

    spindle.sendToFrontend({
      type: "secondary_generation_complete",
      chatId,
      messageId: targetMessageId,
      content: updatedContent,
    }, activeUserId || undefined);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    // Pre-flight already bailed on empty/placeholder models, so any
    // upstream model-field rejection here means the user's configured id
    // didn't satisfy the provider. Point at *that* fix instead of telling
    // them to fill in a field they already filled in.
    const looksLikeModelError = /\bmodel\b/i.test(rawMessage)
      && /(missing|invalid|empty|required|not.*found)/i.test(rawMessage);
    const message = looksLikeModelError
      ? `${rawMessage}\n\n${describeRejectedModelGuidance(trimmedModel)}`
      : rawMessage;
    spindle.log.error(`Secondary LLM generation failed: ${rawMessage}`);
    spindle.sendToFrontend(
      { type: "secondary_generation_error", message, chatId, messageId: targetMessageId },
      activeUserId || undefined,
    );
    await trackEvent("sst.secondary_generation.failed", { error: rawMessage }, { level: "error" });
  }
}

// `GENERATION_STARTED` fires immediately before the interceptor runs and
// reliably carries the active chat id in its typed payload. Mirror it into
// `activeChatId` so the interceptor can fall back on it when its `context`
// argument (typed as `unknown` in the SDK) doesn't surface one. Also use
// this as the trigger to prime the side-channel for chats the extension
// hasn't observed activity on yet (e.g. first generation after reload).
spindle.on("GENERATION_STARTED", (payload: unknown, userId?: string) => {
  void (async () => {
    await ensureConfigForUser(userId);
    if (!payload || typeof payload !== "object") return;
    const obj = payload as Record<string, unknown>;
    const chatId = typeof obj.chatId === "string" ? obj.chatId : null;
    if (!chatId) return;
    activeChatId = chatId;
    await rehydrateChatTrackerHistory(chatId);
  })();
});

spindle.on("CHAT_SWITCHED", (payload: unknown, userId?: string) => {
  void (async () => {
    await ensureConfigForUser(userId);
    if (!payload || typeof payload !== "object") return;
    const obj = payload as Record<string, unknown>;
    const chatId = typeof obj.chatId === "string"
      ? obj.chatId
      : typeof obj.chat_id === "string"
        ? obj.chat_id
        : null;
    if (chatId) activeChatId = chatId;
    if (chatId) {
      void rehydrateChatTrackerHistory(chatId);
    }
  })();
});

// When a message disappears, evict its side-channel entry. Without this,
// `getRecentChatTrackers` would still surface the deleted message's
// tracker as "previous state" on a future regenerate, and the side panel
// could keep pointing at a row the user removed.
spindle.on("MESSAGE_DELETED", (payload: unknown, userId?: string) => {
  void (async () => {
    await ensureConfigForUser(userId);
    const ctx = readMessageContext(payload);
    if (!ctx.chatId || !ctx.messageId) return;
    forgetChatTracker(ctx.chatId, ctx.messageId);
    spindle.log.info(`Forgot tracker side-channel entry for deleted message ${ctx.messageId} in chat ${ctx.chatId}`);
  })();
});

spindle.on("GENERATION_ENDED", (payload: unknown, userId?: string) => {
  void (async () => {
    await ensureConfigForUser(userId);
    const ctx = readMessageContext(payload);
    if (ctx.chatId) {
      activeChatId = ctx.chatId;
      void rehydrateChatTrackerHistory(ctx.chatId);
    }

    if (!config.useSecondaryLLM) return;
    if (!hasPermission("generation") || !hasPermission("chat_mutation")) return;
    if (!ctx.chatId) return;

    let chatMessages: Array<{ id: string; role: "system" | "user" | "assistant"; content: string }>;
    try {
      chatMessages = await spindle.chat.getMessages(ctx.chatId);
    } catch {
      return;
    }

    const latestAssistant = chatMessages.findLast((m) => m.role === "assistant");
    if (!latestAssistant) return;

    // If the latest assistant already has a tracker in its canonical content,
    // capture it into the side-channel before skipping secondary generation
    // — that way future runs still see it even if subsequent edits/swipes
    // strip the tag.
    const existingPayload = extractTrackerPayloadFromMessage(latestAssistant.content);
    if (existingPayload) {
      recordChatTracker(ctx.chatId, latestAssistant.id, existingPayload);
      return;
    }

    // Enqueue serially — never drop a request because a previous secondary
    // is still in flight, which is what caused "last message sometimes has
    // no tracker" when users replied faster than the sidecar completed.
    void enqueueSecondaryGeneration(ctx.chatId, latestAssistant.id);
  })();
});

/**
 * Global variant of `stripOldTrackerBlocks`: counts tracker blocks across
 * the entire message array (not per-message) and retains the `keepNewest`
 * most recent ones globally. Older blocks are removed from whichever
 * messages contained them. This matches the user-facing semantics of
 * `retainTrackerCount` — "keep the N most recent tracker snapshots in the
 * LLM context" — whereas the previous per-message implementation could
 * never strip anything once each message only held a single tracker.
 */
function stripOldTrackerBlocksGlobal<T extends { content: string }>(
  messages: T[],
  identifier: string,
  keepNewest: number,
): T[] {
  if (keepNewest < 0) return messages;

  const desiredType = sanitizeIdentifier(identifier);

  type BlockRef = { msgIdx: number; start: number; end: number };
  const allBlocks: BlockRef[] = [];

  messages.forEach((msg, msgIdx) => {
    if (!msg || typeof msg.content !== "string") return;
    const fenceRe = buildTrackerFenceRegex(identifier, "gi");
    const tagRe = buildTrackerTagRegex(config.trackerTagName, "gi");
    for (const match of msg.content.matchAll(fenceRe)) {
      const text = match[0] || "";
      if (typeof match.index !== "number" || !text) continue;
      allBlocks.push({ msgIdx, start: match.index, end: match.index + text.length });
    }
    for (const match of msg.content.matchAll(tagRe)) {
      const text = match[0] || "";
      if (typeof match.index !== "number" || !text) continue;
      const attrs = parseTagAttributes(match[1] || "");
      const foundType = sanitizeIdentifier(attrs.type || "");
      if (foundType && foundType !== desiredType) continue;
      allBlocks.push({ msgIdx, start: match.index, end: match.index + text.length });
    }
    for (const range of legacyHiddenDivTrackerRanges(msg.content)) {
      allBlocks.push({ msgIdx, start: range.start, end: range.end });
    }
  });

  if (allBlocks.length === 0) return messages;

  // Sort chronologically (by message, then by position in message) and
  // drop duplicates where the fence and tag regex both captured the same
  // span.
  allBlocks.sort((a, b) => a.msgIdx - b.msgIdx || a.start - b.start);
  const deduped: BlockRef[] = [];
  for (const block of allBlocks) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.msgIdx === block.msgIdx && prev.start === block.start) continue;
    deduped.push(block);
  }

  const stripUpTo = keepNewest === 0 ? deduped.length : Math.max(0, deduped.length - keepNewest);
  if (stripUpTo === 0) return messages;

  const stripByMessage = new Map<number, Set<number>>();
  for (let i = 0; i < stripUpTo; i += 1) {
    const ref = deduped[i];
    let set = stripByMessage.get(ref.msgIdx);
    if (!set) {
      set = new Set<number>();
      stripByMessage.set(ref.msgIdx, set);
    }
    set.add(ref.start);
  }

  return messages.map((msg, msgIdx) => {
    if (!msg || typeof msg.content !== "string") return msg;
    const stripStarts = stripByMessage.get(msgIdx);
    if (!stripStarts || stripStarts.size === 0) return msg;

    const content = msg.content;
    const fenceRe = buildTrackerFenceRegex(identifier, "gi");
    const tagRe = buildTrackerTagRegex(config.trackerTagName, "gi");
    const ranges: Array<{ start: number; end: number; shouldStrip: boolean }> = [];

    for (const match of content.matchAll(fenceRe)) {
      const text = match[0] || "";
      if (typeof match.index !== "number" || !text) continue;
      ranges.push({
        start: match.index,
        end: match.index + text.length,
        shouldStrip: stripStarts.has(match.index),
      });
    }
    for (const match of content.matchAll(tagRe)) {
      const text = match[0] || "";
      if (typeof match.index !== "number" || !text) continue;
      const attrs = parseTagAttributes(match[1] || "");
      const foundType = sanitizeIdentifier(attrs.type || "");
      if (foundType && foundType !== desiredType) continue;
      ranges.push({
        start: match.index,
        end: match.index + text.length,
        shouldStrip: stripStarts.has(match.index),
      });
    }
    for (const range of legacyHiddenDivTrackerRanges(content)) {
      ranges.push({
        start: range.start,
        end: range.end,
        shouldStrip: stripStarts.has(range.start),
      });
    }
    ranges.sort((a, b) => a.start - b.start);

    let out = "";
    let cursor = 0;
    for (const range of ranges) {
      out += content.slice(cursor, range.start);
      if (!range.shouldStrip) {
        out += content.slice(range.start, range.end);
      }
      cursor = range.end;
    }
    out += content.slice(cursor);
    const cleaned = out.replace(/\n\s*\n\s*\n/g, "\n\n").trim();
    return { ...msg, content: cleaned };
  });
}

/**
 * Best-effort resolution of the chat id associated with the current
 * interceptor invocation. The SDK types the `context` parameter as
 * `unknown`, so we probe a few common shapes and then fall back on
 * `activeChatId` (populated from `GENERATION_STARTED` and friends).
 */
function resolveInterceptorChatId(context: unknown): string | null {
  if (context && typeof context === "object") {
    const obj = context as Record<string, unknown>;
    const candidates: unknown[] = [
      obj.chatId,
      obj.chat_id,
      (obj.chat as Record<string, unknown> | undefined)?.id,
      (obj.generation as Record<string, unknown> | undefined)?.chatId,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim().length > 0) return c;
    }
  }
  return activeChatId;
}

/**
 * Count how many tracker blocks (fences, tags, or legacy hidden-divs)
 * appear in a single message content string.
 */
function countMatchingTrackerBlocksInMessage(content: string): number {
  if (!content) return 0;
  let count = 0;

  const fenceRe = buildTrackerFenceRegex(config.codeBlockIdentifier, "gi");
  for (const match of content.matchAll(fenceRe)) {
    if (match[0]) count++;
  }

  const tagRe = buildTrackerTagRegex(config.trackerTagName, "gi");
  const cleanIdentifier = sanitizeIdentifier(config.codeBlockIdentifier);
  for (const match of content.matchAll(tagRe)) {
    const attrs = parseTagAttributes(match[1] || "");
    const typeAttr = sanitizeIdentifier(attrs.type || "");
    if (typeAttr && typeAttr !== cleanIdentifier) continue;
    if (match[0]) count++;
  }

  for (const _range of legacyHiddenDivTrackerRanges(content)) {
    count++;
  }

  return count;
}

/**
 * Count tracker blocks across the whole message array.  Unlike the old
 * `messagesContainTracker` helper, this counts *all* blocks so we can tell
 * whether the prompt already satisfies the user's `retainTrackerCount`.
 */
function countTrackersInMessages(messages: Array<{ content?: string }>): number {
  let count = 0;
  for (const msg of messages) {
    if (!msg || typeof msg.content !== "string") continue;
    count += countMatchingTrackerBlocksInMessage(msg.content);
  }
  return count;
}

/**
 * Build the injection block that gets appended to the last assistant
 * message when the assembled context is missing tracker history. Emits
 * the same tag format the main LLM is instructed to produce, so the
 * model sees the block as a continuation of its own previous output
 * rather than as an out-of-band instruction.
 */
function buildTrackerInjectionBlock(entries: TrackerHistoryEntry[]): string {
  const tagName = sanitizeTagName(config.trackerTagName);
  const identifier = sanitizeIdentifier(config.codeBlockIdentifier);
  return entries
    .map((entry) => `<${tagName} type="${identifier}">\n${entry.payload}\n</${tagName}>`)
    .join("\n\n");
}

let interceptorRegistered = false;

function tryRegisterInterceptor(): void {
  if (interceptorRegistered) return;
  if (!hasPermission("interceptor")) return;

  try {
    spindle.registerInterceptor(async (messages: any[], context: unknown) => {
      const keepNewest = config.retainTrackerCount;
      if (keepNewest < 0) return messages;
      if (!Array.isArray(messages) || messages.length === 0) return messages;

      // 1. Strip older tracker blocks so the prompt never exceeds the
      //    user's retention limit.
      const retained = stripOldTrackerBlocksGlobal(messages, config.codeBlockIdentifier, keepNewest);

      // If the user explicitly set `retainTrackerCount` to 0 they want a
      // clean context — skip injection entirely.
      if (keepNewest === 0) return retained;

      // 2. Count how many tracker blocks remain after stripping.  If we
      //    already have enough, the LLM can reference them directly.
      const currentCount = countTrackersInMessages(retained);
      if (currentCount >= keepNewest) return retained;

      // 3. Otherwise the prompt is short on tracker history (usually because
      //    the frontend's tag interceptor has `removeFromMessage: true`).
      //    Back-fill the difference from the side-channel so the main LLM
      //    still sees the last N tracker states.
      const chatId = resolveInterceptorChatId(context);
      if (!chatId) return retained;

      // Ensure the side-channel is primed. Rehydration is idempotent and
      // a no-op after the first call for a given chat.
      await rehydrateChatTrackerHistory(chatId);

      const needed = keepNewest - currentCount;

      // ── Conception gate ───────────────────────────────────────────────
      // Check the very latest tracker for characters in the fertile
      // window (ovulation / rut / early-luteal) with womb fullness above
      // threshold. On a coin-flip pass (or auto-pass at 100 %):
      //   1. Plan a mutation of the stored payload to add `conceived: true`.
      //   2. Commit the mutation to chatTrackerHistory so future turns
      //      inherit the authoritative state.
      //   3. Rewrite the matching tracker block in the in-flight messages
      //      array so the dedup pass below recognises it as the same
      //      entry and the LLM sees only the mutated version this turn.
      //   4. Inject a reminder directive as a belt-and-braces backstop.
      const preMutationLatest = getRecentChatTrackers(chatId, 1);
      const latestPayload = preMutationLatest.length > 0
        ? parseTrackerPayload(preMutationLatest[preMutationLatest.length - 1].payload)
        : null;
      const conceptionNames = latestPayload ? checkConceptionTriggers(chatId, latestPayload) : [];
      if (latestPayload && conceptionNames.length > 0) {
        const plan = planForcedConception(chatId, conceptionNames, extractCurrentDate(latestPayload));
        if (plan) {
          commitForcedConception(chatId, plan);
          rewriteTrackerInMessages(retained, plan.oldPayload, plan.newPayload);
        }
      }
      const conceptionDirective = buildConceptionDirective(conceptionNames);

      // Fetch the most recent entries (post-mutation); we may discard
      // duplicates already represented in the assembled prompt.
      const history = getRecentChatTrackers(chatId, keepNewest);
      if (history.length === 0) return retained;

      const existingPayloads = new Set<string>();
      for (const msg of retained) {
        if (!msg || typeof msg.content !== "string") continue;
        const payload = extractTrackerPayloadFromMessage(msg.content);
        if (payload) existingPayloads.add(payload.trim());
      }

      const toInject = history
        .slice()
        .reverse() // newest first
        .filter((entry) => !existingPayloads.has(entry.payload.trim()))
        .slice(0, needed)
        .reverse(); // back to oldest → newest

      if (toInject.length === 0) return retained;

      const block = buildTrackerInjectionBlock(toInject);

      // Prefer appending to the last assistant message in the array so the
      // tracker appears exactly where the LLM would normally have emitted
      // it in its previous turn. Fall back to synthesising a trailing
      // system message if there's no assistant message yet (first-turn
      // generation, re-greeting, etc.).
      let lastAssistantIdx = -1;
      for (let i = retained.length - 1; i >= 0; i -= 1) {
        const m = retained[i];
        if (m && m.role === "assistant" && typeof m.content === "string") {
          lastAssistantIdx = i;
          break;
        }
      }

      if (lastAssistantIdx >= 0) {
        const injected = retained.slice();
        const target = injected[lastAssistantIdx];
        const base = typeof target.content === "string" ? target.content.trimEnd() : "";
        injected[lastAssistantIdx] = {
          ...target,
          content: base ? `${base}\n\n${block}` : block,
        };
        if (conceptionDirective) {
          injected.splice(injected.length - 1, 0, { role: "system", content: conceptionDirective });
        }
        return injected;
      }

      // Insert a synthetic system message near the end of the conversation
      // so the LLM still picks up the prior tracker state.
      const injected = retained.slice();
      const insertAt = Math.max(0, injected.length - 1);
      injected.splice(insertAt, 0, { role: "system", content: block });
      if (conceptionDirective) {
        injected.splice(insertAt + 1, 0, { role: "system", content: conceptionDirective });
      }
      return injected;
    }, 90);
    interceptorRegistered = true;
    spindle.log.info("Interceptor registered");
  } catch {
    spindle.log.warn("Interceptor registration failed");
  }
}

// Attempt initial interceptor registration
tryRegisterInterceptor();

async function initGrantedPermissions(): Promise<void> {
  try {
    const granted = await spindle.permissions.getGranted();
    runtime.grantedPermissions = new Set(granted);
    spindle.log.info(`Granted permissions: ${granted.join(", ") || "none"}`);
  } catch {
    runtime.grantedPermissions = new Set();
    spindle.log.warn("Unable to read granted permissions");
  }
}

async function refreshGrantedPermissions(): Promise<void> {
  try {
    const granted = await spindle.permissions.getGranted();
    runtime.grantedPermissions = new Set(granted);
  } catch {
    // Keep last known permissions snapshot.
  }
}

// ── Real-time Permission Gating ──────────────────────────────────────

spindle.permissions.onChanged(({ permission, granted, allGranted }) => {
  runtime.grantedPermissions = new Set(allGranted);
  spindle.log.info(
    `Permission "${permission}" ${granted ? "granted" : "revoked"} — active: ${allGranted.join(", ") || "none"}`,
  );

  // Re-register interceptor if it becomes available
  if (permission === "interceptor" && granted) {
    tryRegisterInterceptor();
  }

  // Push updated permission state to frontend
  spindle.sendToFrontend({
    type: "permission_changed",
    permission,
    granted,
    allGranted,
  }, activeUserId || undefined);
});

spindle.permissions.onDenied(({ permission, operation }) => {
  spindle.log.warn(`Permission "${permission}" denied for operation: ${operation}`);
});

async function getEphemeralPoolStatusSafe(): Promise<Record<string, unknown> | null> {
  if (!hasPermission("ephemeral_storage")) return null;
  try {
    return await spindle.ephemeral.getPoolStatus();
  } catch {
    return null;
  }
}

async function sendConfigState(): Promise<void> {
  try {
    await refreshGrantedPermissions();
    await loadSeededTemplatePresets();
    spindle.sendToFrontend({
      type: "config",
      config,
      grantedPermissions: Array.from(runtime.grantedPermissions),
      requestedPermissions: spindle.manifest?.permissions || [],
      seededPresets: runtime.seededPresets,
      ephemeralPoolStatus: await getEphemeralPoolStatusSafe(),
    }, activeUserId || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spindle.log.error(`sendConfigState failed: ${message}`);
  }
}

async function handleImportPresetFile(payload: Record<string, unknown>): Promise<void> {
  const text = typeof payload.text === "string" ? payload.text : "";
  const fileName = typeof payload.fileName === "string" ? payload.fileName : "import.json";
  if (!text.trim()) {
    spindle.sendToFrontend({
      type: "import_result",
      ok: false,
      message: "Import failed (empty file).",
    }, activeUserId || undefined);
    return;
  }

  if (hasPermission("ephemeral_storage")) {
    try {
      const encoded = new TextEncoder().encode(text);
      const reservation = await spindle.ephemeral.requestBlock(encoded.byteLength, {
        ttlMs: 2 * 60 * 1000,
        reason: "sst import staging",
      });
      const path = `imports/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      await spindle.ephemeral.write(path, text, {
        ttlMs: 2 * 60 * 1000,
        reservationId: reservation.reservationId,
      });
      await spindle.ephemeral.releaseBlock(reservation.reservationId);
    } catch {
      // Staging is optional for import flow.
    }
  }

  let parsed: Record<string, unknown>;
  try {
    const json = JSON.parse(text) as unknown;
    if (!json || typeof json !== "object") throw new Error("invalid");
    parsed = json as Record<string, unknown>;
  } catch {
    spindle.sendToFrontend({
      type: "import_result",
      ok: false,
      message: "Import failed (invalid JSON).",
    }, activeUserId || undefined);
    await trackEvent("sst.import.failed", { reason: "invalid_json", fileName }, { level: "warn" });
    return;
  }

  if (Array.isArray(parsed.inlineTemplates) && parsed.inlineTemplates.length > 0) {
    config = { ...config, inlinePacks: [...config.inlinePacks, parsed] };
    await saveConfig();
    pushMacroValues();
    await sendConfigState();
    spindle.sendToFrontend({
      type: "import_result",
      ok: true,
      message: `Imported inline pack: ${String(parsed.templateName || "Unnamed")}`,
    }, activeUserId || undefined);
    await trackEvent("sst.import.inline_pack", { fileName }, { level: "info" });
    return;
  }

  const idBase = String(parsed.templateName || "user_preset").toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const preset: TemplatePreset = {
    id: `${idBase}_${Date.now()}`,
    templateName: String(parsed.templateName || "Imported Preset"),
    templateAuthor: String(parsed.templateAuthor || "User"),
    htmlTemplate: typeof parsed.htmlTemplate === "string" ? parsed.htmlTemplate : "",
    sysPrompt: typeof parsed.sysPrompt === "string" ? parsed.sysPrompt : "",
    displayInstructions: typeof parsed.displayInstructions === "string" ? parsed.displayInstructions : "",
    inlineTemplatesEnabled: typeof parsed.inlineTemplatesEnabled === "boolean" ? parsed.inlineTemplatesEnabled : false,
    inlineTemplates: Array.isArray(parsed.inlineTemplates) ? parsed.inlineTemplates : [],
    customFields: Array.isArray(parsed.customFields)
      ? (parsed.customFields as Array<{ key: string; description: string }>)
      : [],
    extSettings: (parsed.extSettings && typeof parsed.extSettings === "object" ? parsed.extSettings : {}) as Record<string, unknown>,
  };

  config = {
    ...config,
    userPresets: [...config.userPresets, preset],
    templateId: preset.id,
  };
  await saveConfig();
  pushMacroValues();
  await sendConfigState();
  spindle.sendToFrontend({
    type: "import_result",
    ok: true,
    message: `Imported preset: ${preset.templateName}`,
  }, activeUserId || undefined);
  await trackEvent("sst.import.preset", { fileName, templateId: preset.id }, { level: "info" });
}

spindle.onFrontendMessage(async (payload: unknown, userId: string) => {
  if (!payload || typeof payload !== "object") return;
  activeUserId = userId;
  const message = payload as Record<string, unknown>;

  if (message.type === "get_config") {
    try {
      await loadConfig();
      await sendConfigState();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      spindle.log.error(`get_config handler failed: ${msg}`);
    }
    return;
  }

  if (message.type === "set_config") {
    const incoming = message.config as Partial<TrackerConfig>;
    config = {
      trackerTagName: sanitizeTagName(incoming?.trackerTagName ?? config.trackerTagName),
      codeBlockIdentifier: sanitizeIdentifier(incoming?.codeBlockIdentifier ?? config.codeBlockIdentifier),
      hideSimBlocks: sanitizeBool(incoming?.hideSimBlocks ?? config.hideSimBlocks, config.hideSimBlocks),
      templateId: sanitizeTemplateId(incoming?.templateId ?? config.templateId),
      trackerFormat: sanitizeTrackerFormat(incoming?.trackerFormat ?? config.trackerFormat),
      retainTrackerCount: sanitizeRetainCount(incoming?.retainTrackerCount ?? config.retainTrackerCount),
      enableInlineTemplates: sanitizeInlineEnabled(incoming?.enableInlineTemplates ?? config.enableInlineTemplates),
      userPresets: sanitizePresetArray(incoming?.userPresets ?? config.userPresets),
      inlinePacks: sanitizeInlinePacks(incoming?.inlinePacks ?? config.inlinePacks),
      useSecondaryLLM: sanitizeBool(incoming?.useSecondaryLLM ?? config.useSecondaryLLM, config.useSecondaryLLM),
      secondaryLLMConnectionId: sanitizeStr(incoming?.secondaryLLMConnectionId ?? config.secondaryLLMConnectionId, config.secondaryLLMConnectionId),
      secondaryLLMModel: sanitizeSecondaryLLMModel(incoming?.secondaryLLMModel ?? config.secondaryLLMModel, config.secondaryLLMModel),
      secondaryLLMMessageCount: sanitizeMessageCount(incoming?.secondaryLLMMessageCount ?? config.secondaryLLMMessageCount),
      secondaryLLMTemperature: sanitizeTemperature(incoming?.secondaryLLMTemperature ?? config.secondaryLLMTemperature),
      secondaryLLMStripHTML: sanitizeBool(incoming?.secondaryLLMStripHTML ?? config.secondaryLLMStripHTML, config.secondaryLLMStripHTML),
    };
    await saveConfig();
    pushMacroValues();
    await trackEvent("sst.config.updated", {
      trackerTagName: config.trackerTagName,
      templateId: config.templateId,
      trackerFormat: config.trackerFormat,
      retainTrackerCount: config.retainTrackerCount,
      hideSimBlocks: config.hideSimBlocks,
      useSecondaryLLM: config.useSecondaryLLM,
    });
    await sendConfigState();
    return;
  }

  if (message.type === "get_connections") {
    if (!hasPermission("generation")) {
      spindle.log.warn("get_connections: 'generation' permission not granted");
      spindle.sendToFrontend({
        type: "connections_list",
        connections: [],
        error: "Generation permission not granted",
      }, userId);
      return;
    }
    try {
      spindle.log.info(`get_connections: requesting with userId=${userId || "(none)"}`);
      const connections = await spindle.connections.list(userId || undefined);
      spindle.log.info(`get_connections: received ${connections?.length ?? 0} connection(s)`);
      spindle.sendToFrontend({ type: "connections_list", connections: connections ?? [] }, userId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      spindle.log.error(`get_connections failed: ${msg}`);
      spindle.sendToFrontend({ type: "connections_list", connections: [], error: msg }, userId);
    }
    return;
  }

  if (message.type === "trigger_secondary_generation") {
    const chatId = typeof message.chatId === "string" ? message.chatId : null;
    const messageId = typeof message.messageId === "string" ? message.messageId : null;
    if (chatId && messageId) {
      void enqueueSecondaryGeneration(chatId, messageId);
    }
    return;
  }

  if (message.type === "regenerate_secondary_tracker") {
    const chatId = typeof message.chatId === "string" ? message.chatId : null;
    const hintedMessageId = typeof message.messageId === "string" ? message.messageId : null;
    if (!chatId) return;
    if (!hasPermission("chat_mutation")) {
      spindle.sendToFrontend(
        { type: "secondary_generation_error", message: "Regenerate requires 'chat_mutation' permission" },
        userId,
      );
      return;
    }

    const messages = await spindle.chat.getMessages(chatId);
    let target = hintedMessageId
      ? messages.find((m) => m.id === hintedMessageId && m.role === "assistant") || null
      : null;
    // Fall back to the most recent assistant message — whether or not it
    // already carries a tracker — so the user can ask for a fresh generation
    // even on a message that's never been processed yet.
    if (!target) {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role === "assistant") {
          target = messages[i];
          break;
        }
      }
    }
    if (!target) {
      spindle.sendToFrontend(
        { type: "secondary_generation_error", message: "No assistant message was found in this chat to regenerate." },
        userId,
      );
      return;
    }

    const tagRe = buildTrackerTagRegex(sanitizeTagName(config.trackerTagName), "gi");
    const fenceRe = buildTrackerFenceRegex(config.codeBlockIdentifier, "gi");
    const hadTracker = extractTrackerPayloadFromMessage(target.content) !== null;
    if (hadTracker) {
      const stripped = target.content.replace(tagRe, "").replace(fenceRe, "").replace(/\n{3,}/g, "\n\n").trimEnd();
      spindle.log.info(`Regenerate: stripping existing tracker from message ${target.id} in chat ${chatId}`);
      await spindle.chat.updateMessage(chatId, target.id, { content: stripped });
      forgetChatTracker(chatId, target.id);
    } else {
      spindle.log.info(`Regenerate: message ${target.id} in chat ${chatId} has no tracker yet — generating fresh`);
    }

    void enqueueSecondaryGeneration(chatId, target.id);
    return;
  }

  if (message.type === "get_latest_tracker") {
    const chatId = typeof message.chatId === "string" ? message.chatId : null;
    if (!chatId) {
      spindle.sendToFrontend({ type: "tracker_history_latest", chatId: null, entry: null }, userId);
      return;
    }
    activeChatId = chatId;
    await rehydrateChatTrackerHistory(chatId);
    const history = getChatTrackerHistory(chatId);
    const entry = history.length > 0 ? history[history.length - 1] : null;
    spindle.sendToFrontend({
      type: "tracker_history_latest",
      chatId,
      entry: entry ? { messageId: entry.messageId, payload: entry.payload } : null,
    }, userId);
    return;
  }

  if (message.type === "remove_inline_pack") {
    const index = typeof message.index === "number" ? message.index : -1;
    if (index >= 0 && index < config.inlinePacks.length) {
      const next = config.inlinePacks.slice();
      next.splice(index, 1);
      config = { ...config, inlinePacks: next };
      await saveConfig();
      pushMacroValues();
      await sendConfigState();
    }
    return;
  }

  if (message.type === "toggle_inline_pack") {
    const index = typeof message.index === "number" ? message.index : -1;
    const enabled = typeof message.enabled === "boolean" ? message.enabled : true;
    if (index >= 0 && index < config.inlinePacks.length) {
      const next = config.inlinePacks.slice();
      next[index] = { ...(next[index] as Record<string, unknown>), enabled };
      config = { ...config, inlinePacks: next };
      await saveConfig();
      pushMacroValues();
      await sendConfigState();
    }
    return;
  }

  if (message.type === "import_preset_file") {
    await handleImportPresetFile(message);
  }
});

await initGrantedPermissions();
await loadConfig();
spindle.log.info("Silly Sim Tracker (Lumiverse) backend started");
try {
  await sendConfigState();
} catch {
  // Ignore — frontend will request config when ready.
}

export {};

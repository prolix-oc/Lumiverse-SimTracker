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

function extractTrackerPayloadFromMessage(message: string): string | null {
  return (
    extractTrackerTag(message, config.trackerTagName, config.codeBlockIdentifier) ||
    extractSimBlock(message, config.codeBlockIdentifier)
  );
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

async function rehydrateChatTrackerHistory(chatId: string | null): Promise<void> {
  if (!chatId || rehydratedChats.has(chatId)) return;
  rehydratedChats.add(chatId);
  try {
    const messages = await spindle.chat.getMessages(chatId);
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
  try {
    const parsed = await spindle.userStorage.getJson<Partial<TrackerConfig>>(CONFIG_PATH, { fallback: { ...DEFAULT_CONFIG }, userId: activeUserId || undefined });
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
      secondaryLLMModel: sanitizeStr(parsed.secondaryLLMModel, DEFAULT_CONFIG.secondaryLLMModel),
      secondaryLLMMessageCount: sanitizeMessageCount(parsed.secondaryLLMMessageCount),
      secondaryLLMTemperature: sanitizeTemperature(parsed.secondaryLLMTemperature),
      secondaryLLMStripHTML: sanitizeBool(parsed.secondaryLLMStripHTML, DEFAULT_CONFIG.secondaryLLMStripHTML),
    };
  } catch {
    config = { ...DEFAULT_CONFIG };
  }
  pushMacroValues();
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
}

spindle.on("MESSAGE_SENT", (payload: unknown) => {
  void (async () => {
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

spindle.on("MESSAGE_EDITED", (payload: unknown) => {
  void (async () => {
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

spindle.on("MESSAGE_SWIPED", (payload: unknown) => {
  void (async () => {
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

spindle.on("MESSAGE_TAG_INTERCEPTED", (payload: unknown) => {
  void (async () => {
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

const promptMap: Record<string, string> = {
  "bento-style-tracker": getTemplatePresetById("bento-style-tracker").sysPrompt || "",
  "dating-card-template": getTemplatePresetById("dating-card-template").sysPrompt || "",
  "tactical-hud-sidebar-tabs": getTemplatePresetById("tactical-hud-sidebar-tabs").sysPrompt || "",
  "rpg-sidebar-preset": getTemplatePresetById("rpg-sidebar-preset").sysPrompt || "",
  "pulse-thread-tracker": getTemplatePresetById("pulse-thread-tracker").sysPrompt || "",
};

/**
 * Push current macro values to the host so prompt assembly can resolve
 * them instantly without an RPC roundtrip to the worker.
 */
function pushMacroValues(): void {
  // sim_format
  const fmt = buildExampleTrackerBlock(config.trackerFormat, config.codeBlockIdentifier);
  spindle.updateMacroValue("sim_format", fmt);

  // sim_tracker
  const tag = config.trackerTagName || "tracker";
  const id = config.codeBlockIdentifier || "sim";
  const base = promptMap[config.templateId] || "";
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

let secondaryGenerationInProgress = false;

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

async function generateTrackerWithSecondaryLLM(chatId: string, targetMessageId: string): Promise<void> {
  if (secondaryGenerationInProgress) return;
  if (!config.useSecondaryLLM) return;
  if (!hasPermission("generation")) {
    spindle.log.warn("Secondary LLM generation requires 'generation' permission");
    return;
  }
  if (!hasPermission("chat_mutation")) {
    spindle.log.warn("Secondary LLM generation requires 'chat_mutation' permission");
    return;
  }

  secondaryGenerationInProgress = true;
  spindle.sendToFrontend({ type: "secondary_generation_started" }, activeUserId || undefined);

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
    const historyLimit = Math.max(1, Math.min(10, config.retainTrackerCount || 3));
    let historicalTrackers = getRecentChatTrackers(chatId, historyLimit, targetMessageId).map(
      (entry) => entry.payload,
    );

    if (historicalTrackers.length === 0) {
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

    const parameters: Record<string, unknown> = {
      temperature: config.secondaryLLMTemperature,
    };
    if (config.secondaryLLMModel) {
      parameters.model = config.secondaryLLMModel;
    }

    spindle.log.info("Starting secondary LLM generation...");
    const result = await spindle.generate.raw({
      type: "raw",
      messages: llmMessages,
      parameters,
      connection_id: config.secondaryLLMConnectionId || undefined,
      userId: activeUserId || undefined,
    });

    const resultObj = result as Record<string, unknown>;
    const generatedText = typeof resultObj.content === "string" ? resultObj.content : "";
    if (!generatedText) {
      spindle.log.warn("Secondary LLM returned empty response");
      spindle.sendToFrontend({ type: "secondary_generation_error", message: "Empty response from LLM" }, activeUserId || undefined);
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
      spindle.sendToFrontend({ type: "secondary_generation_error", message: "LLM response was not valid tracker data" }, activeUserId || undefined);
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
      messageId: targetMessageId,
      content: updatedContent,
    }, activeUserId || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    spindle.log.error(`Secondary LLM generation failed: ${message}`);
    spindle.sendToFrontend({ type: "secondary_generation_error", message }, activeUserId || undefined);
    await trackEvent("sst.secondary_generation.failed", { error: message }, { level: "error" });
  } finally {
    secondaryGenerationInProgress = false;
  }
}

// `GENERATION_STARTED` fires immediately before the interceptor runs and
// reliably carries the active chat id in its typed payload. Mirror it into
// `activeChatId` so the interceptor can fall back on it when its `context`
// argument (typed as `unknown` in the SDK) doesn't surface one. Also use
// this as the trigger to prime the side-channel for chats the extension
// hasn't observed activity on yet (e.g. first generation after reload).
spindle.on("GENERATION_STARTED", (payload: unknown) => {
  void (async () => {
    if (!payload || typeof payload !== "object") return;
    const obj = payload as Record<string, unknown>;
    const chatId = typeof obj.chatId === "string" ? obj.chatId : null;
    if (!chatId) return;
    activeChatId = chatId;
    await rehydrateChatTrackerHistory(chatId);
  })();
});

spindle.on("CHAT_CHANGED", (payload: unknown) => {
  if (!payload || typeof payload !== "object") return;
  const obj = payload as Record<string, unknown>;
  const chatId = typeof obj.chatId === "string"
    ? obj.chatId
    : typeof obj.chat_id === "string"
      ? obj.chat_id
      : null;
  if (chatId) activeChatId = chatId;
});

spindle.on("GENERATION_ENDED", (payload: unknown) => {
  void (async () => {
    const ctx = readMessageContext(payload);
    if (ctx.chatId) {
      activeChatId = ctx.chatId;
      void rehydrateChatTrackerHistory(ctx.chatId);
    }

    if (!config.useSecondaryLLM || secondaryGenerationInProgress) return;
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

    await generateTrackerWithSecondaryLLM(ctx.chatId, latestAssistant.id);
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
 * Returns true if any user or assistant message in the list still contains
 * a tracker tag or fence block for the current identifier. System messages
 * are deliberately excluded: the `sim_tracker` macro expands into the
 * system prompt with a literal tracker-tag format example (`<tracker
 * type="sim">{...}</tracker>`), and that example would otherwise be
 * mistaken for real tracker data and suppress re-injection from the
 * side-channel.
 */
function messagesContainTracker(messages: Array<{ role?: string; content: string }>): boolean {
  for (const msg of messages) {
    if (!msg || typeof msg.content !== "string") continue;
    if (msg.role === "system") continue;
    if (extractTrackerPayloadFromMessage(msg.content)) return true;
  }
  return false;
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

      // 1. Honour the global retention limit on any trackers that survived
      //    into canonical storage (the `removeFromMessage: false` path).
      const retained = stripOldTrackerBlocksGlobal(messages, config.codeBlockIdentifier, keepNewest);

      // If the user explicitly set `retainTrackerCount` to 0 they want a
      // clean context — skip injection entirely.
      if (keepNewest === 0) return retained;

      // 2. If the assembled messages already contain tracker blocks, we're
      //    done. The main LLM can reference them directly.
      if (messagesContainTracker(retained)) return retained;

      // 3. Otherwise the messages have no tracker data — almost always
      //    because the frontend's tag interceptor has `removeFromMessage:
      //    true` stripping trackers out of canonical message content.
      //    Re-inject the most recent history entries from the side-channel
      //    so the main LLM can still see "the last tracker state" and
      //    generate the next one as a continuation.
      const chatId = resolveInterceptorChatId(context);
      if (!chatId) return retained;

      // Ensure the side-channel is primed. Rehydration is idempotent and
      // a no-op after the first call for a given chat.
      await rehydrateChatTrackerHistory(chatId);

      const injectCount = Math.max(1, Math.min(10, keepNewest));
      const history = getRecentChatTrackers(chatId, injectCount);
      if (history.length === 0) return retained;

      const block = buildTrackerInjectionBlock(history);

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
        return injected;
      }

      // Insert a synthetic system message near the end of the conversation
      // so the LLM still picks up the prior tracker state.
      const injected = retained.slice();
      const insertAt = Math.max(0, injected.length - 1);
      injected.splice(insertAt, 0, { role: "system", content: block });
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
  await refreshGrantedPermissions();
  await loadSeededTemplatePresets();
  spindle.sendToFrontend({
    type: "config",
    config,
    grantedPermissions: Array.from(runtime.grantedPermissions),
    requestedPermissions: spindle.manifest.permissions || [],
    seededPresets: runtime.seededPresets,
    ephemeralPoolStatus: await getEphemeralPoolStatusSafe(),
  }, activeUserId || undefined);
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
    await loadConfig();
    await sendConfigState();
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
      secondaryLLMModel: sanitizeStr(incoming?.secondaryLLMModel ?? config.secondaryLLMModel, config.secondaryLLMModel),
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
      await generateTrackerWithSecondaryLLM(chatId, messageId);
    }
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

export {};

import Handlebars from "handlebars";
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { getTemplatePresets, type TemplatePreset } from "./templatePresets";
import { parseTrackerBlock, type TrackerData } from "./trackerData";
import { createInlineTemplateProcessor } from "./inlineTemplates";

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

type ConnectionProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
  is_default: boolean;
  has_api_key: boolean;
};

type CharacterStats = Record<string, unknown>;
type TrackerMountMode = "message_top" | "message_bottom" | "side_left" | "side_right";

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

const BUILTIN_PRESETS = getTemplatePresets();
let runtimeSeededPresets: TemplatePreset[] = [];
const TEMPLATE_CACHE = new Map<string, Handlebars.TemplateDelegate>();
let helpersRegistered = false;
let panelRoot: Element | null = null;

const FERTILITY_STAGE_BY_ID: Record<number, string> = {
  1: "menstruation",
  2: "follicular",
  3: "ovulation",
  4: "luteal",
  5: "pregnancy",
  6: "rut",
};

const FERTILITY_STAGE_ID_BY_NAME = Object.fromEntries(
  Object.entries(FERTILITY_STAGE_BY_ID).map(([id, name]) => [name, Number(id)]),
) as Record<string, number>;

const CERVIX_STATE_BY_ID: Record<number, string> = {
  0: "",
  1: "sealed",
  2: "firm",
  3: "soft",
  4: "open",
  5: "dilated",
  6: "kissed",
};

function cycleStage(stats: unknown): string {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return "";
  const record = stats as Record<string, unknown>;
  const stageId = Number(record.cycle_stage_id || record.cycleStageId || 0);
  if (FERTILITY_STAGE_BY_ID[stageId]) return FERTILITY_STAGE_BY_ID[stageId];
  return typeof record.cycle_stage === "string" ? record.cycle_stage.toLowerCase() : "";
}

function cycleStageId(stats: unknown): number {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return 0;
  const record = stats as Record<string, unknown>;
  const stageId = Number(record.cycle_stage_id || record.cycleStageId || 0);
  if (FERTILITY_STAGE_BY_ID[stageId]) return stageId;
  return FERTILITY_STAGE_ID_BY_NAME[cycleStage(record)] || 0;
}

function cycleStageLabel(stats: unknown): string {
  const stage = cycleStage(stats);
  if (!stage) return "Unknown";
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

function cervixState(stats: unknown): string {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return "";
  const record = stats as Record<string, unknown>;
  const id = Number(record.cervix_state_id || record.cervixStateId || 0);
  if (CERVIX_STATE_BY_ID[id]) return CERVIX_STATE_BY_ID[id];
  const legacy = typeof record.cervix_state === "string" ? record.cervix_state.toLowerCase() : "";
  return legacy;
}

function cervixStateLabel(stats: unknown): string {
  const state = cervixState(stats);
  if (!state) return "Unknown";
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function fertilityRiskLabel(stats: unknown): string {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return "Unknown";
  const record = stats as Record<string, unknown>;
  const stage = cycleStage(record);
  if (record.preg === true || stage === "pregnancy") return "Pregnant";
  if (stage === "ovulation") return "High";
  if (stage === "luteal") return "Medium";
  if (stage === "menstruation" || stage === "follicular") return "Low";
  return "Unknown";
}

function fertilityRiskClass(stats: unknown): string {
  const risk = fertilityRiskLabel(stats).toLowerCase();
  if (risk === "high") return "risk-high";
  if (risk === "medium") return "risk-med";
  if (risk === "pregnant") return "risk-preg";
  if (risk === "low") return "risk-low";
  return "risk-unknown";
}

function sexValue(stats: unknown): string {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return "";
  return String((stats as Record<string, unknown>).sex || "").toLowerCase();
}

function hasMaleBiology(stats: unknown): boolean {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return false;
  const record = stats as Record<string, unknown>;
  const sex = sexValue(record);
  return (
    ["male", "futanari", "futa", "both", "intersex", "hermaphrodite"].includes(sex) ||
    Number(record.refractory_minutes) > 0 ||
    Number(record.semen_capacity_ml) > 0 ||
    Number(record.semen_ml) > 0 ||
    Number(record.male_fertility_pct) > 0
  );
}

function hasFemaleBiology(stats: unknown): boolean {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return false;
  const record = stats as Record<string, unknown>;
  const sex = sexValue(record);
  const stage = cycleStage(record);
  return (
    ["female", "futanari", "futa", "both", "intersex", "hermaphrodite"].includes(sex) ||
    record.preg === true ||
    record.conceived === true ||
    Number(record.cycle_day) > 0 ||
    Number(record.womb_fullness_pct) > 0 ||
    ["pregnancy", "ovulation", "menstruation", "follicular", "luteal"].includes(stage)
  );
}

function hasAnalTracking(stats: unknown): boolean {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return false;
  const record = stats as Record<string, unknown>;
  const sex = sexValue(record);
  return (
    ["male", "female", "futanari", "futa", "both", "intersex", "hermaphrodite"].includes(sex) ||
    Number(record.anal_fullness_pct) > 0 ||
    Number(record.anal_tightness_pct) > 0 ||
    Number(record.prostate_stimulation_pct) > 0
  );
}

function hasProstateTracking(stats: unknown): boolean {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return false;
  const record = stats as Record<string, unknown>;
  const sex = sexValue(record);
  return (
    ["male", "futanari", "futa", "both", "intersex", "hermaphrodite"].includes(sex) ||
    Number(record.prostate_stimulation_pct) > 0
  );
}

function isConceived(stats: unknown): boolean {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return false;
  const record = stats as Record<string, unknown>;
  return record.conceived === true && record.preg !== true;
}

function clampPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, Math.min(100, n)));
}

function percentOf(value: unknown, total: unknown): number {
  const denominator = Number(total);
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return clampPercent(((Number(value) || 0) / denominator) * 100);
}

function maleFertilityLabel(stats: unknown): string {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return "Unknown";
  const record = stats as Record<string, unknown>;
  const pct = Number(record.male_fertility_pct ?? record.sperm_count_pct);
  if (!Number.isFinite(pct)) return "Unknown";
  if (pct >= 80) return "Very high";
  if (pct >= 60) return "High";
  if (pct >= 35) return "Average";
  if (pct >= 15) return "Low";
  return "Very low";
}

function maleFertilityPercent(stats: unknown): number {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return 0;
  const record = stats as Record<string, unknown>;
  return clampPercent(record.male_fertility_pct ?? record.sperm_count_pct);
}

function semenPercent(stats: unknown): number {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return 0;
  const record = stats as Record<string, unknown>;
  return percentOf(record.semen_ml, record.semen_capacity_ml);
}

function wombFillTop(value: unknown): number {
  const pct = clampPercent(value);
  // Inner cavity spans y≈24 (top) to y≈88 (bottom) → height 64
  return 88 - (pct / 100) * 64;
}

function wombFillHeight(value: unknown): number {
  const pct = clampPercent(value);
  return (pct / 100) * 64;
}

function analFillTop(value: unknown): number {
  const pct = clampPercent(value);
  // Inner cavity spans y≈15 (top) to y≈105 (bottom) → height 90
  return 105 - (pct / 100) * 90;
}

function analFillHeight(value: unknown): number {
  const pct = clampPercent(value);
  return (pct / 100) * 90;
}

function semenFillTop(value: unknown): number {
  const pct = clampPercent(value);
  // Testicle fill spans y≈86 to y≈130 → height 44
  return 130 - (pct / 100) * 44;
}

function semenFillHeight(value: unknown): number {
  const pct = clampPercent(value);
  return (pct / 100) * 44;
}

function byId<T extends Element>(id: string): T | null {
  const scoped = panelRoot?.querySelector(`#${id}`) as T | null;
  if (scoped) return scoped;
  return document.getElementById(id) as T | null;
}

const PANEL_HTML = `
  <section id="sst-lumi-panel" class="sst-lumi-panel">
    <header class="sst-lumi-header">
      <h3>Silly Sim Tracker</h3>
      <span class="sst-lumi-status" id="sst-lumi-status">Waiting for tracker tag...</span>
    </header>
    <div class="sst-lumi-controls">
      <label>Template<select id="sst-lumi-template"></select></label>
      <label>Tracker tag<input id="sst-lumi-tag" type="text" value="tracker" maxlength="30" /></label>
      <label>Identifier<input id="sst-lumi-identifier" type="text" value="sim" maxlength="30" /></label>
      <label>Preferred format<select id="sst-lumi-format"><option value="json">JSON</option><option value="yaml">YAML</option></select></label>
      <label>Retain tracker tags in prompt<input id="sst-lumi-retain" type="number" min="0" max="20" value="3" /></label>
      <label class="sst-lumi-checkbox"><input id="sst-lumi-inline" type="checkbox" />Enable inline displays</label>
      <label class="sst-lumi-checkbox"><input id="sst-lumi-hide" type="checkbox" checked />Hide tracker tags in chat</label>
      <div class="sst-lumi-actions">
        <button id="sst-lumi-save" type="button">Save</button>
        <button id="sst-lumi-export" type="button">Export Preset</button>
        <button id="sst-lumi-import" type="button">Import Preset</button>
      </div>
      <div id="sst-lumi-capabilities" class="sst-lumi-capabilities">Capabilities: loading...</div>
    </div>
    <details id="sst-lumi-packs-section" class="sst-lumi-packs-section">
      <summary class="sst-lumi-packs-summary">Inline Display Packs <span id="sst-lumi-packs-count" class="sst-lumi-packs-count">(0)</span></summary>
      <div class="sst-lumi-packs-controls">
        <div id="sst-lumi-packs-list" class="sst-lumi-packs-list"></div>
        <button id="sst-lumi-import-pack" type="button" class="sst-lumi-pack-import">Import Inline Pack</button>
        <div class="sst-lumi-pack-hint">Packs apply globally whenever "Enable inline displays" is on, independent of the selected template.</div>
      </div>
    </details>
    <details id="sst-lumi-llm-section" class="sst-lumi-llm-section">
      <summary class="sst-lumi-llm-summary">Secondary LLM Generation</summary>
      <div class="sst-lumi-llm-controls">
        <label class="sst-lumi-checkbox"><input id="sst-lumi-llm-enable" type="checkbox" />Enable secondary LLM generation</label>
        <label>Connection Profile
          <select id="sst-lumi-llm-connection"><option value="">Loading connections...</option></select>
          <button id="sst-lumi-llm-refresh" type="button" class="sst-lumi-llm-refresh">Refresh</button>
        </label>
        <label>Model Override<input id="sst-lumi-llm-model" type="text" placeholder="Leave empty to use connection default" /></label>
        <label>Context Messages<input id="sst-lumi-llm-msgcount" type="number" min="1" max="50" value="5" /></label>
        <label>Temperature<input id="sst-lumi-llm-temp" type="number" min="0" max="2" step="0.1" value="0.7" /></label>
        <label class="sst-lumi-checkbox"><input id="sst-lumi-llm-strip" type="checkbox" checked />Strip structural HTML from context</label>
        <div id="sst-lumi-llm-status" class="sst-lumi-llm-status"></div>
      </div>
    </details>
    <div id="sst-lumi-body" class="sst-lumi-body"></div>
    <div id="sst-lumi-command" class="sst-lumi-command" style="display:none"></div>
  </section>
`;

const PANEL_CSS = `
  .sst-lumi-panel { width: 100%; max-height: min(80vh, 900px); overflow: auto; border: 1px solid var(--lumiverse-border); border-radius: calc(var(--lumiverse-radius) + 2px); background: linear-gradient(180deg, var(--lumiverse-fill) 0%, var(--lumiverse-fill-subtle) 100%); color: var(--lumiverse-text); box-shadow: 0 14px 50px rgba(0, 0, 0, 0.28); }
  .sst-lumi-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--lumiverse-border); }
  .sst-lumi-header h3 { margin: 0; font-size: 13px; }
  .sst-lumi-status { color: var(--lumiverse-text-muted); font-size: 11px; }
  .sst-lumi-controls { padding: 10px 12px; border-bottom: 1px solid var(--lumiverse-border); display: grid; gap: 8px; }
  .sst-lumi-controls label { font-size: 11px; color: var(--lumiverse-text-muted); display: grid; gap: 5px; }
  .sst-lumi-controls input[type="text"], .sst-lumi-controls input[type="number"], .sst-lumi-controls select { font-size: 12px; padding: 6px 8px; border: 1px solid var(--lumiverse-border); border-radius: 8px; background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); }
  .sst-lumi-checkbox { align-items: center; display: flex !important; gap: 8px; }
  .sst-lumi-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .sst-lumi-actions button { font-size: 12px; padding: 5px 10px; border: 1px solid var(--lumiverse-border); border-radius: 8px; background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); cursor: pointer; }
  .sst-lumi-capabilities { font-size: 11px; color: var(--lumiverse-text-muted); border: 1px dashed var(--lumiverse-border); border-radius: 8px; padding: 7px 8px; }
  .sst-lumi-body { padding: 12px; display: grid; gap: 8px; }
  .sst-lumi-raw { font-size: 11px; border: 1px dashed var(--lumiverse-border); border-radius: 8px; padding: 8px; color: var(--lumiverse-text-muted); white-space: pre-wrap; word-break: break-word; }
  .sst-inline-section { border: 1px solid var(--lumiverse-border); border-radius: 10px; padding: 10px; background: var(--lumiverse-fill-subtle); }
  .sst-inline-title { font-size: 11px; color: var(--lumiverse-text-muted); margin-bottom: 8px; }
  .sst-inline-item { margin-bottom: 8px; }
  .sst-lumi-command { margin: 10px 12px 12px; padding: 10px; border: 1px solid var(--lumiverse-border); border-radius: 10px; background: var(--lumiverse-fill-subtle); display: grid; gap: 8px; }
  .sst-lumi-command textarea { width: 100%; min-height: 96px; resize: vertical; font-size: 11px; border: 1px solid var(--lumiverse-border); border-radius: 8px; background: var(--lumiverse-fill); color: var(--lumiverse-text); padding: 8px; }
  .sst-lumi-command button { width: fit-content; font-size: 11px; padding: 5px 10px; border: 1px solid var(--lumiverse-border); border-radius: 8px; background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); cursor: pointer; }
  .sst-lumi-packs-section { border-bottom: 1px solid var(--lumiverse-border); }
  .sst-lumi-packs-summary { padding: 10px 12px; font-size: 12px; cursor: pointer; color: var(--lumiverse-text); user-select: none; }
  .sst-lumi-packs-summary:hover { background: var(--lumiverse-fill-subtle); }
  .sst-lumi-packs-count { color: var(--lumiverse-text-muted); font-size: 11px; margin-left: 4px; }
  .sst-lumi-packs-controls { padding: 0 12px 10px; display: grid; gap: 8px; }
  .sst-lumi-packs-list { display: grid; gap: 6px; }
  .sst-lumi-packs-list:empty::before { content: "No packs imported. Click below to import one."; font-size: 11px; color: var(--lumiverse-text-muted); font-style: italic; }
  .sst-lumi-pack-row { display: flex; align-items: center; gap: 8px; padding: 7px 9px; border: 1px solid var(--lumiverse-border); border-radius: 8px; background: var(--lumiverse-fill-subtle); }
  .sst-lumi-pack-row.sst-pack-disabled { opacity: 0.55; }
  .sst-lumi-pack-info { flex: 1 1 auto; min-width: 0; display: grid; gap: 2px; }
  .sst-lumi-pack-name { font-size: 12px; color: var(--lumiverse-text); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sst-lumi-pack-meta { font-size: 10px; color: var(--lumiverse-text-muted); }
  .sst-lumi-pack-toggle { display: flex; align-items: center; gap: 4px; font-size: 10px; color: var(--lumiverse-text-muted); cursor: pointer; }
  .sst-lumi-pack-remove { font-size: 11px; padding: 3px 7px; border: 1px solid var(--lumiverse-border); border-radius: 6px; background: var(--lumiverse-fill); color: var(--lumiverse-text); cursor: pointer; }
  .sst-lumi-pack-remove:hover { color: #ff6b6b; border-color: #ff6b6b; }
  .sst-lumi-pack-import { font-size: 11px; padding: 5px 10px; border: 1px solid var(--lumiverse-border); border-radius: 8px; background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); cursor: pointer; width: fit-content; }
  .sst-lumi-pack-hint { font-size: 10px; color: var(--lumiverse-text-muted); font-style: italic; }
  .sst-lumi-llm-section { border-bottom: 1px solid var(--lumiverse-border); }
  .sst-lumi-llm-summary { padding: 10px 12px; font-size: 12px; cursor: pointer; color: var(--lumiverse-text); user-select: none; }
  .sst-lumi-llm-summary:hover { background: var(--lumiverse-fill-subtle); }
  .sst-lumi-llm-controls { padding: 0 12px 10px; display: grid; gap: 8px; }
  .sst-lumi-llm-controls label { font-size: 11px; color: var(--lumiverse-text-muted); display: grid; gap: 5px; }
  .sst-lumi-llm-controls input[type="text"], .sst-lumi-llm-controls input[type="number"], .sst-lumi-llm-controls select { font-size: 12px; padding: 6px 8px; border: 1px solid var(--lumiverse-border); border-radius: 8px; background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); }
  .sst-lumi-llm-refresh { font-size: 11px; padding: 4px 8px; border: 1px solid var(--lumiverse-border); border-radius: 6px; background: var(--lumiverse-fill-subtle); color: var(--lumiverse-text); cursor: pointer; width: fit-content; margin-top: 4px; }
  .sst-lumi-llm-status { font-size: 11px; color: var(--lumiverse-text-muted); min-height: 16px; }
  .sst-lumi-llm-status.sst-generating { color: var(--lumiverse-accent, #7c6aef); }
  .sst-lumi-llm-status.sst-error { color: #ff6b6b; }
  .sst-disabled { opacity: 0.5; pointer-events: none; }
  .sst-app-side-panel { position: fixed; top: 0; bottom: 0; width: 340px; z-index: 50; pointer-events: none; }
  .sst-app-side-panel.sst-app-side-right { right: 48px; }
  .sst-app-side-panel.sst-app-side-left { left: 0; }
  .sst-side-tracker-root { width: 100%; height: 100%; position: relative; overflow-y: auto; overflow-x: hidden; box-sizing: border-box; padding: 8px; display: flex; flex-direction: column; pointer-events: none; scrollbar-width: none; -ms-overflow-style: none; }
  .sst-side-tracker-root::-webkit-scrollbar { width: 0; height: 0; display: none; }
  .sst-side-tracker-root::-webkit-scrollbar-track { background: transparent; }
  .sst-side-tracker-root::-webkit-scrollbar-thumb { background: transparent; }
  .sst-side-tracker-root > #silly-sim-tracker-container { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; width: 100%; }
  .sst-side-tracker-root .sim-tracker-tab, .sst-side-tracker-root .sim-tracker-card { pointer-events: auto; }
  .sst-message-tracker-host { width: 100%; }
  .sst-theme-tactical #silly-sim-tracker-container { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lumiverse-accent) 15%, transparent); }
`;

function sanitizeIdentifier(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "sim";
}

function sanitizeTagName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "tracker";
}

function sanitizeRetainCount(value: string): number {
  const num = Number(value);
  if (Number.isNaN(num)) return 3;
  return Math.max(0, Math.min(20, Math.floor(num)));
}

// Mirror backend.ts sanitizeSecondaryLLMModel — coerce known placeholder
// strings to "" so the field doesn't silently 400 the provider with
// model:"string" when the user enables the sidecar without filling it in.
const SECONDARY_LLM_MODEL_PLACEHOLDERS = new Set(["", "string", "model", "your-model-here", "null", "undefined"]);

function sanitizeSecondaryLLMModel(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return SECONDARY_LLM_MODEL_PLACEHOLDERS.has(trimmed.toLowerCase()) ? "" : trimmed;
}

function getAllPresets(config: TrackerConfig): TemplatePreset[] {
  return [...BUILTIN_PRESETS, ...runtimeSeededPresets, ...config.userPresets];
}

function getPresetById(config: TrackerConfig, id: string): TemplatePreset {
  return getAllPresets(config).find((preset) => preset.id === id) || BUILTIN_PRESETS[0];
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractTrackerBlock(content: string, identifier: string): string | null {
  const tagName = sanitizeTagName(configTrackerTagNameHint || "tracker");
  const tagRe = new RegExp(String.raw`<${escapeRegex(tagName)}\b([^>]*)>([\s\S]*?)<\/${escapeRegex(tagName)}>` , "ig");
  const cleanIdentifier = sanitizeIdentifier(identifier);
  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRe.exec(content)) !== null) {
    const attrsRaw = tagMatch[1] || "";
    const attrs = parseTagAttrs(attrsRaw);
    const foundType = sanitizeIdentifier(attrs.type || "");
    if (foundType && foundType !== cleanIdentifier) continue;
    return tagMatch[2]?.trim() || null;
  }

  if (!cleanIdentifier) return null;
  const id = escapeRegex(cleanIdentifier);
  const re = new RegExp(String.raw`(?:^|\n)\s*\`\`\`[ \t]*${id}(?=[ \t\r\n]|$)[^\n\r]*\r?\n([\s\S]*?)\r?\n?\s*\`\`\``, "i");
  return content.match(re)?.[1]?.trim() || null;
}

function parseTagAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const attrRe = /([a-zA-Z_:][a-zA-Z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRe.exec(raw)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    out[key] = value;
  }
  return out;
}

let configTrackerTagNameHint = "tracker";

function readMessageContext(payload: unknown): { content: string | null; messageId: string | null; isUser: boolean | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  const messageIdCandidate = typeof value.messageId === "string" ? value.messageId : typeof value.message_id === "string" ? value.message_id : null;
  if (typeof value.content === "string") {
    return {
      content: value.content,
      messageId: messageIdCandidate,
      isUser: typeof value.is_user === "boolean" ? value.is_user : null,
    };
  }
  const nested = value.message as Record<string, unknown> | undefined;
  return {
    content: typeof nested?.content === "string" ? nested.content : null,
    messageId:
      typeof nested?.id === "string"
        ? nested.id
        : typeof nested?.messageId === "string"
          ? nested.messageId
          : messageIdCandidate,
    isUser: typeof nested?.is_user === "boolean" ? nested.is_user : null,
  };
}

function resolveTrackerMountMode(preset: TemplatePreset): TrackerMountMode {
  const fromPreset = typeof preset.templatePosition === "string" ? preset.templatePosition : "";
  const htmlTemplate = decodeTemplateHtml(preset.htmlTemplate);
  const fromHtml = htmlTemplate
    ? (htmlTemplate.match(/<!--\s*POSITION:\s*([A-Za-z_ -]+)\s*-->/i)?.[1] || "")
    : "";
  const raw = (fromPreset || fromHtml || "BOTTOM").trim().toUpperCase();
  if (raw === "TOP") return "message_top";
  if (raw === "LEFT") return "side_left";
  if (raw === "RIGHT") return "side_right";
  return "message_bottom";
}

function setStatus(text: string): void {
  const el = byId<HTMLElement>("sst-lumi-status");
  if (el) el.textContent = text;
}

function renderCapabilities(
  grantedPermissions: string[],
  requestedPermissions: string[],
  ephemeralPoolStatus: Record<string, unknown> | null,
): void {
  const perms = grantedPermissions.length ? grantedPermissions.join(", ") : "none";
  const missing = requestedPermissions.filter((p) => !grantedPermissions.includes(p));
  const missingText = missing.length ? ` | missing: ${missing.join(", ")}` : "";
  const extAvail = typeof ephemeralPoolStatus?.extensionAvailableBytes === "number"
    ? ` | ephemeral available: ${ephemeralPoolStatus.extensionAvailableBytes} bytes`
    : "";
  const text = `Capabilities: ${perms}${missingText}${extAvail}`;
  const el = byId<HTMLElement>("sst-lumi-capabilities");
  if (el) el.textContent = text;
}

function renderEmpty(message: string): void {
  const body = byId<HTMLElement>("sst-lumi-body");
  if (!body) return;
  body.innerHTML = "";
  const p = document.createElement("p");
  p.className = "sst-lumi-raw";
  p.textContent = message;
  body.appendChild(p);
}

function getReactionEmoji(value: unknown): string {
  const num = Number(value);
  if (num === 1) return "❤️";
  if (num === 2) return "😡";
  return "😐";
}

function darkenColor(hex: string, amount = 20): string {
  const clean = hex.replace("#", "");
  const r = Math.max(0, parseInt(clean.slice(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(clean.slice(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(clean.slice(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function adjustColorBrightness(hex: string, brightnessPercent: number): string {
  const clean = (hex || "#000000").replace("#", "");
  const factor = Math.max(0, Math.min(100, brightnessPercent)) / 100;
  const r = Math.min(255, Math.max(0, Math.floor(parseInt(clean.substring(0, 2), 16) * factor)));
  const g = Math.min(255, Math.max(0, Math.floor(parseInt(clean.substring(2, 4), 16) * factor)));
  const b = Math.min(255, Math.max(0, Math.floor(parseInt(clean.substring(4, 6), 16) * factor)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hn = h / 360;
  const sn = s / 100;
  const ln = l / 100;
  if (sn === 0) {
    const gray = Math.round(ln * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  return {
    r: Math.round(hue2rgb(p, q, hn + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hn) * 255),
    b: Math.round(hue2rgb(p, q, hn - 1 / 3) * 255),
  };
}

function adjustHslColor(hex: string, hueShift: number, saturationAdjust: number, lightnessAdjust: number): string {
  const clean = (hex || "#000000").replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const hsl = rgbToHsl(r, g, b);

  let h = (hsl.h + hueShift) % 360;
  if (h < 0) h += 360;
  const s = Math.max(0, Math.min(100, hsl.s + saturationAdjust));
  const l = Math.max(0, Math.min(100, hsl.l + lightnessAdjust));
  const rgb = hslToRgb(h, s, l);
  return `#${rgb.r.toString(16).padStart(2, "0")}${rgb.g.toString(16).padStart(2, "0")}${rgb.b.toString(16).padStart(2, "0")}`;
}

function decodeTemplateHtml(htmlTemplate?: string): string {
  const raw = htmlTemplate || "";
  if (!/&lt;(?:!--|style|div|script|section|article|span)\b/i.test(raw)) return raw;

  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function extractTemplateLogic(htmlTemplate?: string): string | null {
  const decoded = decodeTemplateHtml(htmlTemplate);
  if (!decoded) return null;
  const scriptRegex = /<script\s+type=["']text\/x-handlebars-template-logic["'][^>]*>([\s\S]*?)<\/script>/i;
  const match = decoded.match(scriptRegex);
  if (!match?.[1]) return null;
  return match[1].trim();
}

function executeTemplateLogic<T extends Record<string, unknown>>(input: T, templateType: "single" | "tabbed", preset: TemplatePreset): T {
  const logic = extractTemplateLogic(preset.htmlTemplate);
  if (!logic) return input;
  try {
    const fn = new Function("data", "templateType", `"use strict";\n${logic}\n; return data;`) as (data: T, templateType: string) => T;
    return fn(input, templateType);
  } catch {
    return input;
  }
}

function normalizeCharacters(data: TrackerData): Array<Record<string, unknown>> {
  if (Array.isArray(data.characters)) return data.characters;
  const out: Array<Record<string, unknown>> = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === "worldData") continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push({ name: key, ...(value as Record<string, unknown>) });
    }
  }
  return out;
}

function getDeepValue(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

function findNumericPaths(obj: unknown, prefix = ""): string[] {
  const paths: string[] = [];
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "number") {
        paths.push(path);
      } else if (value && typeof value === "object" && !Array.isArray(value)) {
        paths.push(...findNumericPaths(value, path));
      }
    }
  }
  return paths;
}

function calculateStatChanges(currentCharacters: Array<Record<string, unknown>>, previous: TrackerData | null): Record<string, Record<string, unknown>> {
  const changes: Record<string, Record<string, unknown>> = {};
  if (!previous) {
    for (const char of currentCharacters) {
      const name = typeof char.name === "string" ? char.name : "Character";
      changes[name] = {};
    }
    return changes;
  }

  const prevChars = normalizeCharacters(previous);
  const prevByName = new Map<string, Record<string, unknown>>();
  for (const char of prevChars) {
    const name = typeof char.name === "string" ? char.name : "";
    if (name) prevByName.set(name, char);
  }

  for (const current of currentCharacters) {
    const name = typeof current.name === "string" ? current.name : "Character";
    const prev = prevByName.get(name);
    if (!prev) {
      changes[name] = {};
      continue;
    }

    const out: Record<string, unknown> = {};
    for (const path of findNumericPaths(prev)) {
      const curVal = getDeepValue(current, path);
      const prevVal = getDeepValue(prev, path);
      if (typeof curVal === "number" && typeof prevVal === "number") {
        out[`${path}Change`] = curVal - prevVal;
      }
    }
    changes[name] = out;
  }
  return changes;
}

function registerTemplateHelpers(): void {
  if (helpersRegistered) return;
  helpersRegistered = true;

  Handlebars.registerHelper("eq", (a, b) => a === b);
  Handlebars.registerHelper("eqi", (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase());
  Handlebars.registerHelper("cycleStage", cycleStage);
  Handlebars.registerHelper("cycleStageId", cycleStageId);
  Handlebars.registerHelper("cycleStageLabel", cycleStageLabel);
  Handlebars.registerHelper("cervixState", cervixState);
  Handlebars.registerHelper("cervixStateLabel", cervixStateLabel);
  Handlebars.registerHelper("fertilityRiskLabel", fertilityRiskLabel);
  Handlebars.registerHelper("fertilityRiskClass", fertilityRiskClass);
  Handlebars.registerHelper("hasFertilityTracking", hasFemaleBiology);
  Handlebars.registerHelper("hasRefractoryTracking", hasMaleBiology);
  Handlebars.registerHelper("hasMaleBiology", hasMaleBiology);
  Handlebars.registerHelper("hasFemaleBiology", hasFemaleBiology);
  Handlebars.registerHelper("isConceived", isConceived);
  Handlebars.registerHelper("clampPercent", clampPercent);
  Handlebars.registerHelper("percentOf", percentOf);
  Handlebars.registerHelper("maleFertilityLabel", maleFertilityLabel);
  Handlebars.registerHelper("maleFertilityPercent", maleFertilityPercent);
  Handlebars.registerHelper("semenPercent", semenPercent);
  Handlebars.registerHelper("wombFillTop", wombFillTop);
  Handlebars.registerHelper("wombFillHeight", wombFillHeight);
  Handlebars.registerHelper("hasAnalTracking", hasAnalTracking);
  Handlebars.registerHelper("hasProstateTracking", hasProstateTracking);
  Handlebars.registerHelper("analFillTop", analFillTop);
  Handlebars.registerHelper("analFillHeight", analFillHeight);
  Handlebars.registerHelper("semenFillTop", semenFillTop);
  Handlebars.registerHelper("semenFillHeight", semenFillHeight);
  // Variadic `or` / `and` — last argument is the Handlebars options
  // object, so we peel it off before folding. Values use JS truthiness
  // so `0`, `""`, `null`, `undefined`, and `false` are all falsy.
  Handlebars.registerHelper("or", function (...args: unknown[]) {
    const values = args.slice(0, -1);
    return values.some((v) => !!v);
  });
  Handlebars.registerHelper("and", function (...args: unknown[]) {
    const values = args.slice(0, -1);
    return values.every((v) => !!v);
  });
  Handlebars.registerHelper("not", (value: unknown) => !value);
  Handlebars.registerHelper("gt", (a, b) => Number(a) > Number(b));
  Handlebars.registerHelper("gte", (a, b) => Number(a) >= Number(b));
  Handlebars.registerHelper("lt", (a, b) => Number(a) < Number(b));
  Handlebars.registerHelper("lte", (a, b) => Number(a) <= Number(b));
  Handlebars.registerHelper("abs", (a) => Math.abs(Number(a) || 0));
  Handlebars.registerHelper("multiply", (a, b) => (Number(a) || 0) * (Number(b) || 0));
  Handlebars.registerHelper("subtract", (a, b) => (Number(a) || 0) - (Number(b) || 0));
  Handlebars.registerHelper("add", (a, b) => (Number(a) || 0) + (Number(b) || 0));
  Handlebars.registerHelper("divide", (a, b) => {
    const divisor = Number(b) || 0;
    return divisor === 0 ? 0 : (Number(a) || 0) / divisor;
  });
  Handlebars.registerHelper("divideRoundUp", (a, b) => {
    const divisor = Number(b) || 0;
    return divisor === 0 ? 0 : Math.ceil((Number(a) || 0) / divisor);
  });
  Handlebars.registerHelper("tabZIndex", (i) => 5 - (Number(i) || 0));
  Handlebars.registerHelper("tabOffset", (i) => (Number(i) || 0) * 65);
  Handlebars.registerHelper("initials", (name) => (typeof name === "string" && name.length ? name.charAt(0).toUpperCase() : "?"));
  Handlebars.registerHelper("rawFirstLetter", (name) => (typeof name === "string" && name.length ? name.charAt(0) : "?"));
  Handlebars.registerHelper("slugifyUnderscore", (name) => (typeof name === "string" ? name.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s-]+/g, "_") : ""));
  Handlebars.registerHelper("slugifyDash", (name) => (typeof name === "string" ? name.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_]+/g, "-") : ""));
  Handlebars.registerHelper("camelCase", (name) => {
    if (typeof name !== "string") return "";
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]+/g, " ")
      .trim()
      .split(/\s+/)
      .map((part, idx) => (idx === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1)))
      .join("");
  });
  Handlebars.registerHelper("adjustColorBrightness", (hexColor, brightnessPercent) =>
    adjustColorBrightness(String(hexColor || "#000000"), Number(brightnessPercent) || 100),
  );
  Handlebars.registerHelper("adjustHSL", (hexColor, hueShift, saturationAdjust, lightnessAdjust) =>
    adjustHslColor(
      String(hexColor || "#000000"),
      Number(hueShift) || 0,
      Number(saturationAdjust) || 0,
      Number(lightnessAdjust) || 0,
    ),
  );
}

function extractCardTemplate(htmlTemplate?: string): string {
  const raw = decodeTemplateHtml(htmlTemplate);
  const start = raw.indexOf("<!-- CARD_TEMPLATE_START -->");
  const end = raw.indexOf("<!-- CARD_TEMPLATE_END -->");
  if (start !== -1 && end !== -1 && end > start) {
    return raw.substring(start + "<!-- CARD_TEMPLATE_START -->".length, end).trim();
  }
  return raw.trim();
}

function compileTemplate(preset: TemplatePreset): Handlebars.TemplateDelegate | null {
  const key = preset.id;
  if (TEMPLATE_CACHE.has(key)) return TEMPLATE_CACHE.get(key) || null;
  const html = extractCardTemplate(preset.htmlTemplate);
  if (!html) return null;
  try {
    const compiled = Handlebars.compile(html);
    TEMPLATE_CACHE.set(key, compiled);
    return compiled;
  } catch {
    return null;
  }
}

function buildTemplateData(
  data: TrackerData,
  preset: TemplatePreset,
  previousData: TrackerData | null,
): { tabbed: boolean; input: Record<string, unknown>; fallbackRaw: string } {
  const worldData = (data.worldData || {}) as Record<string, unknown>;
  const characters = normalizeCharacters(data);
  const currentDate = typeof worldData.current_date === "string" ? worldData.current_date : "Unknown Date";
  const currentTime = typeof worldData.current_time === "string" ? worldData.current_time : "Unknown Time";
  const tabbed = (preset.htmlTemplate || "").includes("sim-tracker-tabs") || preset.id.includes("tabs");
  const statChanges = calculateStatChanges(characters, previousData);

  const characterPayload = characters.map((character) => {
    const stats = character as CharacterStats;
    const name = typeof stats.name === "string" ? stats.name : "Character";
    const bgColor = typeof stats.bg === "string" ? stats.bg : "#6a5acd";

    const isNestedStats =
      stats && typeof stats === "object" && typeof stats.stats === "object" && stats.stats !== null;

    const templateStats: CharacterStats = isNestedStats
      ? { ...stats, ...(stats.stats as CharacterStats) }
      : { ...stats };

    // Remove the nested stats reference to avoid shadowing / confusion
    if (isNestedStats) {
      delete templateStats.stats;
    }

    const normalizedCycleStage =
      typeof templateStats.cycle_stage === "string" ? templateStats.cycle_stage.toLowerCase() : templateStats.cycle_stage;
    const normalizedSex = typeof templateStats.sex === "string" ? templateStats.sex.toLowerCase() : templateStats.sex;

    return {
      name,
      characterName: name,
      currentDate,
      currentTime,
      stats: {
        ...templateStats,
        sex: normalizedSex,
        cycle_stage: normalizedCycleStage,
        ...(statChanges[name] || {}),
        internal_thought: stats.internal_thought || stats.thought || "No thought recorded.",
        relationshipStatus: stats.relationshipStatus || "Unknown Status",
        desireStatus: stats.desireStatus || "Unknown Desire",
        inactive: Boolean(stats.inactive),
        inactiveReason: Number(stats.inactiveReason || 0),
      },
      bgColor,
      darkerBgColor: darkenColor(bgColor),
      reactionEmoji: getReactionEmoji(stats.last_react),
      healthIcon: Number(stats.health) === 1 ? "🤕" : Number(stats.health) === 2 ? "💀" : null,
      showThoughtBubble: true,
    };
  });

  if (tabbed) {
    return {
      tabbed: true,
      input: {
        characters: characterPayload,
        currentDate,
        currentTime,
      },
      fallbackRaw: JSON.stringify(data, null, 2),
    };
  }

  return {
    tabbed: false,
    input: {
      characters: characterPayload,
      currentDate,
      currentTime,
    },
    fallbackRaw: JSON.stringify(data, null, 2),
  };
}

function applyThemeClass(preset: TemplatePreset): void {
  const panel = byId<HTMLElement>("sst-lumi-panel");
  if (!panel) return;
  panel.classList.remove("sst-theme-dating", "sst-theme-tactical");
  if (preset.id.includes("tactical")) panel.classList.add("sst-theme-tactical");
  else if (preset.id.includes("dating")) panel.classList.add("sst-theme-dating");
}

function renderTracker(
  data: TrackerData,
  raw: string,
  preset: TemplatePreset,
  previousData: TrackerData | null,
  injectSanitized: (html: string) => void,
): void {
  const body = byId<HTMLElement>("sst-lumi-body");
  if (!body) return;
  body.innerHTML = "";

  const markup = buildTrackerMarkup(data, preset, previousData);
  if (!markup.html) {
    renderEmpty(raw);
    return;
  }
  injectSanitized(markup.html);
}

function buildTrackerMarkup(
  data: TrackerData,
  preset: TemplatePreset,
  previousData: TrackerData | null,
): { html: string | null; fallbackRaw: string } {

  const compiled = compileTemplate(preset);
  if (!compiled) {
    return { html: null, fallbackRaw: rawJson(data) };
  }

  const prep = buildTemplateData(data, preset, previousData);
  try {
    let cardsHtml = "";
    if (prep.tabbed) {
      const transformed = executeTemplateLogic(prep.input, "tabbed", preset);
      cardsHtml = compiled(transformed);
    } else {
      const inputChars = ((prep.input.characters as Array<Record<string, unknown>>) || []);
      cardsHtml = inputChars.map((item) => compiled(executeTemplateLogic(item, "single", preset))).join("");
    }
    const wrapped = `<div id="silly-sim-tracker-container" style="width:100%;">${cardsHtml}</div>`;
    return { html: wrapped, fallbackRaw: prep.fallbackRaw };
  } catch {
    return { html: null, fallbackRaw: prep.fallbackRaw };
  }
}

function rawJson(data: TrackerData): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return "{}";
  }
}

function showCommandResult(payload: Record<string, unknown>): void {
  const panel = byId<HTMLElement>("sst-lumi-command");
  if (!panel) return;

  const ok = Boolean(payload.ok);
  const message = typeof payload.message === "string" ? payload.message : "";
  const block = typeof payload.block === "string" ? payload.block : "";

  if (!message && !block) {
    panel.style.display = "none";
    panel.innerHTML = "";
    return;
  }

  const escaped = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  panel.style.display = "grid";
  panel.innerHTML = `
    <div style="font-size:11px;color:${ok ? "var(--lumiverse-text)" : "#ff6b6b"};">${escaped}</div>
    ${block ? `<textarea id="sst-lumi-command-block" readonly></textarea><button id="sst-lumi-copy-block" type="button">Copy Block</button>` : ""}
  `;

  if (block) {
    const textarea = byId<HTMLTextAreaElement>("sst-lumi-command-block");
    if (textarea) textarea.value = block;
    const copyBtn = byId<HTMLElement>("sst-lumi-copy-block");
    copyBtn?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(block);
      } catch {
        if (textarea) {
          textarea.focus();
          textarea.select();
        }
      }
    });
  }
}

function mountTemplateOptions(config: TrackerConfig): void {
  const select = byId<HTMLSelectElement>("sst-lumi-template");
  if (!select) return;
  select.innerHTML = "";
  const presets = getAllPresets(config);
  for (const preset of presets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.templateName;
    select.appendChild(option);
  }
  if (presets.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No templates available";
    select.appendChild(option);
  }
}

function downloadJson(filename: string, content: unknown): void {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function setup(ctx: SpindleFrontendContext) {
  registerTemplateHelpers();
  ctx.dom.cleanup();

  let config: TrackerConfig = { ...DEFAULT_CONFIG };
  let removeHideStyle: (() => void) | null = null;
  let removeTagInterceptor: (() => void) | null = null;
  let previousTrackerData: TrackerData | null = null;
  let latestContent: string | null = null;
  let latestTrackerMessageId: string | null = null;
  let latestTrackerRaw: string | null = null;
  let latestTrackerSourceContent: string | null = null;
  let configReady = false;
  let pendingTrackerPayload: { raw: string; sourceContent: string; messageId: string | null } | null = null;
  let initialTrackerRehydrateRequested = false;
  const trackerMessageIds = new Set<string>();
  const trackerMessageMounts = new Map<string, Element>();
  type TrackerRenderInputs = {
    data: TrackerData;
    preset: TemplatePreset;
    previousData: TrackerData | null;
    mode: TrackerMountMode;
  };
  const trackerMessageRenders = new Map<string, TrackerRenderInputs>();
  let stopTrackerObserver: (() => void) | null = null;
  const inlineProcessor = createInlineTemplateProcessor({
    getConfig: () => ({
      enableInlineTemplates: config.enableInlineTemplates,
      inlinePacks: config.inlinePacks,
    }),
    getPreset: () => getPresetById(config, config.templateId),
  });
  let sideTrackerMount: Element | null = null;
  let sideAppMount: { mount: any; side: string } | null = null;
  let grantedPermissions: string[] = [];
  let requestedPermissions: string[] = [];
  let ephemeralPoolStatus: Record<string, unknown> | null = null;
  let connections: ConnectionProfile[] = [];

  const removePanelStyle = ctx.dom.addStyle(PANEL_CSS);
  const mountRoot = ctx.ui.mount("settings_extensions");

  // Defensive cleanup: if a previous hot/reload cycle left stale panels,
  // remove them before injecting a fresh instance.
  const stalePanels = document.querySelectorAll("#sst-lumi-panel");
  stalePanels.forEach((node) => node.remove());

  panelRoot = ctx.dom.inject(mountRoot, PANEL_HTML, "beforeend");
  renderCapabilities([], [], null);
  mountTemplateOptions(config);

  const applyHideStyle = () => {
    if (removeHideStyle) {
      removeHideStyle();
      removeHideStyle = null;
    }
    removeHideStyle = ctx.dom.addStyle(
      `pre[data-code-lang="${config.codeBlockIdentifier}"] { display: ${config.hideSimBlocks ? "none" : "block"} !important; }`,
    );
  };

  const populateConnectionDropdown = () => {
    const select = byId<HTMLSelectElement>("sst-lumi-llm-connection");
    if (!select) return;
    select.innerHTML = "";
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = connections.length ? "Use default connection" : "No connections available";
    select.appendChild(emptyOption);
    for (const conn of connections) {
      const option = document.createElement("option");
      option.value = conn.id;
      option.textContent = `${conn.name} (${conn.provider}${conn.model ? " / " + conn.model : ""})${conn.is_default ? " [default]" : ""}`;
      select.appendChild(option);
    }
    if (config.secondaryLLMConnectionId) {
      select.value = config.secondaryLLMConnectionId;
    }
    const modelInput = byId<HTMLInputElement>("sst-lumi-llm-model");
    if (modelInput) {
      const selected = connections.find((c) => c.id === config.secondaryLLMConnectionId);
      modelInput.placeholder = selected?.model
        ? `Default: ${selected.model}`
        : "Leave empty to use connection default";
    }
  };

  const setLLMStatus = (text: string, type: "" | "generating" | "error" = "") => {
    const el = byId<HTMLElement>("sst-lumi-llm-status");
    if (!el) return;
    el.textContent = text;
    el.className = "sst-lumi-llm-status" + (type ? ` sst-${type}` : "");
  };

  const hasPermission = (name: string): boolean => grantedPermissions.includes(name);

  const updatePermissionGatedControls = () => {
    const llmSection = byId<HTMLDetailsElement>("sst-lumi-llm-section");
    const llmEnable = byId<HTMLInputElement>("sst-lumi-llm-enable");
    if (llmSection) {
      const genGranted = hasPermission("generation");
      const mutGranted = hasPermission("chat_mutation");
      const llmAvailable = genGranted && mutGranted;
      llmSection.classList.toggle("sst-disabled", !llmAvailable);
      if (llmEnable) llmEnable.disabled = !llmAvailable;
      if (!llmAvailable) {
        const missing: string[] = [];
        if (!genGranted) missing.push("generation");
        if (!mutGranted) missing.push("chat_mutation");
        setLLMStatus(`Requires permission: ${missing.join(", ")}`, "error");
      }
    }
  };

  const applyTagInterceptor = () => {
    if (removeTagInterceptor) {
      removeTagInterceptor();
      removeTagInterceptor = null;
    }
    removeTagInterceptor = ctx.messages.registerTagInterceptor(
      {
        tagName: config.trackerTagName,
        attrs: { type: config.codeBlockIdentifier },
        removeFromMessage: config.hideSimBlocks,
      },
      (payload) => {
        handleChatSwitch(payload.chatId || null);
        if (typeof payload.content !== "string" || !payload.content.trim()) return;
        handleTrackerPayload(
          payload.content,
          typeof payload.fullMatch === "string" ? payload.fullMatch : payload.content,
          payload.messageId || null,
        );
        ctx.sendToBackend({
          type: "message_tag_intercepted",
          tagName: payload.tagName,
          attrs: payload.attrs,
          content: payload.content,
          messageId: payload.messageId,
          chatId: payload.chatId,
          isStreaming: payload.isStreaming,
        });
      },
    );
  };

  const syncControls = () => {
    mountTemplateOptions(config);
    const templateSelect = byId<HTMLSelectElement>("sst-lumi-template");
    const tagInput = byId<HTMLInputElement>("sst-lumi-tag");
    const identifierInput = byId<HTMLInputElement>("sst-lumi-identifier");
    const hideInput = byId<HTMLInputElement>("sst-lumi-hide");
    const inlineInput = byId<HTMLInputElement>("sst-lumi-inline");
    const formatSelect = byId<HTMLSelectElement>("sst-lumi-format");
    const retainInput = byId<HTMLInputElement>("sst-lumi-retain");
    if (templateSelect) templateSelect.value = config.templateId;
    if (tagInput) tagInput.value = config.trackerTagName;
    if (identifierInput) identifierInput.value = config.codeBlockIdentifier;
    if (hideInput) hideInput.checked = config.hideSimBlocks;
    if (inlineInput) inlineInput.checked = config.enableInlineTemplates;
    if (formatSelect) formatSelect.value = config.trackerFormat;
    if (retainInput) retainInput.value = String(config.retainTrackerCount);

    const llmEnable = byId<HTMLInputElement>("sst-lumi-llm-enable");
    const llmModel = byId<HTMLInputElement>("sst-lumi-llm-model");
    const llmMsgCount = byId<HTMLInputElement>("sst-lumi-llm-msgcount");
    const llmTemp = byId<HTMLInputElement>("sst-lumi-llm-temp");
    const llmStrip = byId<HTMLInputElement>("sst-lumi-llm-strip");
    if (llmEnable) llmEnable.checked = config.useSecondaryLLM;
    if (llmModel) llmModel.value = config.secondaryLLMModel;
    if (llmMsgCount) llmMsgCount.value = String(config.secondaryLLMMessageCount);
    if (llmTemp) llmTemp.value = String(config.secondaryLLMTemperature);
    if (llmStrip) llmStrip.checked = config.secondaryLLMStripHTML;
    populateConnectionDropdown();
    renderInlinePacksList();
  };

  const renderInlinePacksList = () => {
    const list = byId<HTMLElement>("sst-lumi-packs-list");
    const countLabel = byId<HTMLElement>("sst-lumi-packs-count");
    if (!list) return;
    list.innerHTML = "";
    const packs = config.inlinePacks;
    if (countLabel) countLabel.textContent = `(${packs.length})`;
    for (let i = 0; i < packs.length; i += 1) {
      const pack = packs[i] as Record<string, unknown>;
      const enabled = pack.enabled !== false;
      const name = typeof pack.templateName === "string" && pack.templateName.trim() ? pack.templateName : "Unnamed pack";
      const author = typeof pack.templateAuthor === "string" && pack.templateAuthor.trim() ? pack.templateAuthor : "Unknown";
      const templateCount = Array.isArray(pack.inlineTemplates) ? pack.inlineTemplates.length : 0;

      const row = document.createElement("div");
      row.className = `sst-lumi-pack-row${enabled ? "" : " sst-pack-disabled"}`;

      const info = document.createElement("div");
      info.className = "sst-lumi-pack-info";
      const nameEl = document.createElement("div");
      nameEl.className = "sst-lumi-pack-name";
      nameEl.textContent = name;
      const metaEl = document.createElement("div");
      metaEl.className = "sst-lumi-pack-meta";
      metaEl.textContent = `by ${author} · ${templateCount} template${templateCount === 1 ? "" : "s"}`;
      info.append(nameEl, metaEl);

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "sst-lumi-pack-toggle";
      const toggleInput = document.createElement("input");
      toggleInput.type = "checkbox";
      toggleInput.checked = enabled;
      toggleInput.addEventListener("change", () => {
        ctx.sendToBackend({ type: "toggle_inline_pack", index: i, enabled: toggleInput.checked });
      });
      const toggleText = document.createElement("span");
      toggleText.textContent = "Enabled";
      toggleLabel.append(toggleInput, toggleText);

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "sst-lumi-pack-remove";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        ctx.sendToBackend({ type: "remove_inline_pack", index: i });
      });

      row.append(info, toggleLabel, removeBtn);
      list.appendChild(row);
    }
  };

  const injectIntoPanelBody = (html: string) => {
    const panelBody = byId<HTMLElement>("sst-lumi-body");
    if (!panelBody || !panelBody.isConnected) return;
    ctx.dom.inject(panelBody, html, "beforeend");
  };

  const clearMessageTrackerRender = (messageId: string) => {
    const mount = trackerMessageMounts.get(messageId);
    if (mount) {
      mount.remove();
      trackerMessageMounts.delete(messageId);
    }
    trackerMessageRenders.delete(messageId);
  };

  const pruneNonLatestMessageTrackers = () => {
    const allHosts = document.querySelectorAll("[data-sst-message-tracker-id]");
    if (allHosts.length <= 1) return;
    const latestHost = allHosts[allHosts.length - 1];
    const latestId = latestHost.getAttribute("data-sst-message-tracker-id");
    for (const [id, mount] of trackerMessageMounts) {
      if (id === latestId) continue;
      mount.remove();
      trackerMessageMounts.delete(id);
      trackerMessageRenders.delete(id);
    }
    if (latestId) latestTrackerMessageId = latestId;
  };

  const clearSideTrackerRender = () => {
    if (sideTrackerMount) {
      sideTrackerMount.remove();
      sideTrackerMount = null;
    }
    if (sideAppMount) {
      try { sideAppMount.mount.destroy(); } catch { /* already cleaned up */ }
      sideAppMount = null;
    }
  };

  const bindSidePanelTabs = (rootEl: Element | null): void => {
    if (!rootEl) return;
    const wrapper = rootEl.querySelector<HTMLElement>(".sst-side-tracker-root");
    if (!wrapper) return;
    const flagged = wrapper as HTMLElement & { __sstTabsBound?: boolean };
    if (flagged.__sstTabsBound) return;
    flagged.__sstTabsBound = true;
    wrapper.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      const tab = target?.closest?.(".sim-tracker-tab") as HTMLElement | null;
      if (!tab || !wrapper.contains(tab)) return;
      const charId = tab.getAttribute("data-character");
      if (charId === null) return;
      const wasActive = tab.classList.contains("active");
      wrapper.querySelectorAll<HTMLElement>(".sim-tracker-tab.active").forEach((el) => el.classList.remove("active"));
      wrapper.querySelectorAll<HTMLElement>(".sim-tracker-card.active").forEach((el) => el.classList.remove("active"));
      if (!wasActive) {
        tab.classList.add("active");
        const escaped = typeof (window as any).CSS?.escape === "function" ? (window as any).CSS.escape(charId) : charId.replace(/"/g, '\\"');
        const card = wrapper.querySelector<HTMLElement>(`.sim-tracker-card[data-character="${escaped}"]`);
        if (card) card.classList.add("active");
      }
    });
  };

  const renderTrackerInSidebar = (
    data: TrackerData,
    preset: TemplatePreset,
    previousData: TrackerData | null,
    mode: TrackerMountMode,
  ) => {
    const markup = buildTrackerMarkup(data, preset, previousData);
    if (!markup.html) return;

    const side = mode === "side_left" ? "left" : "right";

    // Use mountApp if app_manipulation permission is granted
    if (hasPermission("app_manipulation")) {
      // Reuse existing mount on the same side — just update content
      if (sideAppMount && sideAppMount.side === side) {
        const wrapper = sideAppMount.mount.root.querySelector(".sst-side-tracker-root");
        if (wrapper) {
          wrapper.innerHTML = markup.html;
        } else {
          sideAppMount.mount.root.innerHTML = `<div class="sst-side-tracker-root sst-side-${side}">${markup.html}</div>`;
        }
        bindSidePanelTabs(sideAppMount.mount.root);
        return;
      }

      // Switching sides or first mount — tear down old one, create new
      clearSideTrackerRender();

      try {
        const mount = ctx.ui.mountApp({
          className: `sst-app-side-panel sst-app-side-${side}`,
          position: side === "right" ? "end" : "start",
        });

        mount.root.innerHTML = `<div class="sst-side-tracker-root sst-side-${side}">${markup.html}</div>`;
        sideAppMount = { mount, side };
        bindSidePanelTabs(mount.root);
        return;
      } catch {
        // mountApp failed — fall through to legacy
      }
    }

    // Fallback: legacy ctx.ui.mount("sidebar")
    clearSideTrackerRender();
    const sidebarRoot = ctx.ui.mount("sidebar");
    if (!sidebarRoot) return;
    const sideClass = mode === "side_left" ? "sst-side-left" : "sst-side-right";
    const wrapped = `<div class="sst-side-tracker-root ${sideClass}">${markup.html}</div>`;
    sideTrackerMount = ctx.dom.inject(sidebarRoot, wrapped, "beforeend");
    bindSidePanelTabs(sidebarRoot);
  };

  // Pulse Thread (and similar CSS-only tab templates) gate visibility on
  // `:checked` of radio/checkbox inputs. When React reconciles the bubble
  // subtree around our injected host (e.g. on scroll-back through TanStack
  // Virtual's overscan boundary), the browser sometimes drops the live
  // `.checked` property even though the `checked` HTML attribute stays.
  // Result: the host is in the DOM but per-character pages are all hidden
  // until the user clicks a tab (which re-asserts the property). We do the
  // same thing programmatically — but only when the group has no checked
  // member, so user tab clicks stay sticky.
  const restoreFormControlState = (host: Element): void => {
    const checkboxes = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"][checked]'));
    for (const cb of checkboxes) {
      if (!cb.checked) cb.checked = true;
    }
    const radios = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    const groups = new Map<string, HTMLInputElement[]>();
    for (const r of radios) {
      const name = r.name || "";
      let list = groups.get(name);
      if (!list) { list = []; groups.set(name, list); }
      list.push(r);
    }
    for (const group of groups.values()) {
      if (group.some((r) => r.checked)) continue;
      const defaultChecked = group.find((r) => r.hasAttribute("checked"));
      if (defaultChecked) defaultChecked.checked = true;
    }
  };

  const renderTrackerIntoMessage = (
    messageId: string,
    data: TrackerData,
    preset: TemplatePreset,
    previousData: TrackerData | null,
    mode: TrackerMountMode,
  ) => {
    clearMessageTrackerRender(messageId);
    const messageNode = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageNode) return;

    const bubbleNode =
      (messageNode.querySelector(':scope > div[class*="bubble"]') as Element | null)
      || (messageNode.querySelector('div[class*="bubble"]') as Element | null)
      || (messageNode as Element);

    const markup = buildTrackerMarkup(data, preset, previousData);
    if (!markup.html) return;
    const host = `<div class="sst-message-tracker-host" data-sst-message-tracker-id="${messageId}">${markup.html}</div>`;
    const insertPos: InsertPosition = mode === "message_top" ? "afterbegin" : "beforeend";
    const mount = ctx.dom.inject(bubbleNode, host, insertPos);
    trackerMessageMounts.set(messageId, mount);
    trackerMessageRenders.set(messageId, { data, preset, previousData, mode });
    restoreFormControlState(mount);
  };

  const handleTrackerPayload = (raw: string, sourceContent: string, messageId: string | null = null) => {
    if (!configReady) {
      pendingTrackerPayload = { raw, sourceContent, messageId };
      return;
    }
    if (messageId) {
      trackerMessageIds.add(messageId);
      latestTrackerMessageId = messageId;
    }
    const preset = getPresetById(config, config.templateId);
    const mountMode = resolveTrackerMountMode(preset);
    applyThemeClass(preset);
    const parsed = parseTrackerBlock(raw);
    if (!parsed) {
      setStatus("Tracker found (invalid JSON/YAML)");
      renderEmpty(raw);
      if (messageId) clearMessageTrackerRender(messageId);
      return;
    }
    latestTrackerRaw = raw;
    latestTrackerSourceContent = sourceContent;
    setStatus(`Tracker updated (${preset.templateName})`);
    renderTracker(parsed, raw, preset, previousTrackerData, (html) => {
      injectIntoPanelBody(html);
    });
    const effectiveMessageId = messageId || latestTrackerMessageId;
    if (mountMode === "side_left" || mountMode === "side_right") {
      renderTrackerInSidebar(parsed, preset, previousTrackerData, mountMode);
      if (effectiveMessageId) clearMessageTrackerRender(effectiveMessageId);
    } else if (effectiveMessageId) {
      clearSideTrackerRender();
      renderTrackerIntoMessage(effectiveMessageId, parsed, preset, previousTrackerData, mountMode);
      pruneNonLatestMessageTrackers();
    }

    previousTrackerData = parsed;
  };

  const handleContent = (content: string, messageId: string | null = null) => {
    latestContent = content;
    const raw = extractTrackerBlock(content, config.codeBlockIdentifier);
    if (!raw) {
      let wasLatest = false;
      if (messageId && trackerMessageIds.has(messageId)) {
        trackerMessageIds.delete(messageId);
        clearMessageTrackerRender(messageId);
        if (latestTrackerMessageId === messageId) {
          latestTrackerMessageId = null;
          wasLatest = true;
        }
      }
      if (wasLatest) {
        previousTrackerData = null;
        setStatus("No tracker tag in active swipe/edit");
        renderEmpty("No tracker tag found in this message version.");
      }
      return;
    }
    handleTrackerPayload(raw, content, messageId);
  };

  const persistConfig = () => {
    ctx.sendToBackend({ type: "set_config", config });
  };

  const requestInitialTrackerRehydrate = () => {
    if (initialTrackerRehydrateRequested) return;
    initialTrackerRehydrateRequested = true;
    try {
      const active = ctx.getActiveChat();
      if (active?.chatId && !rehydratedChatIds.has(active.chatId)) {
        rehydratedChatIds.add(active.chatId);
        ctx.sendToBackend({ type: "get_latest_tracker", chatId: active.chatId });
      }
    } catch {
      // getActiveChat is best-effort; ignore if unavailable.
    }
  };

  const backendUnsub = ctx.onBackendMessage((payload: unknown) => {
    const obj = payload as Record<string, unknown>;
    if (obj?.type === "command_result" && obj.payload && typeof obj.payload === "object") {
      showCommandResult(obj.payload as Record<string, unknown>);
      const cmd = (obj.payload as Record<string, unknown>).command;
      if (typeof cmd === "string") {
        setStatus(`Handled /${cmd}`);
      }
      return;
    }
    if (obj?.type === "import_result") {
      const ok = Boolean(obj.ok);
      const message = typeof obj.message === "string" ? obj.message : ok ? "Import complete" : "Import failed";
      setStatus(message);
      return;
    }
    if (obj?.type === "connections_list" && Array.isArray(obj.connections)) {
      connections = obj.connections as ConnectionProfile[];
      populateConnectionDropdown();
      if (connections.length) {
        setLLMStatus(`${connections.length} connection(s) available`);
      } else {
        const reason = typeof obj.error === "string" ? obj.error : "";
        setLLMStatus(reason || "No connections available", reason ? "error" : "");
      }
      return;
    }
    if (obj?.type === "secondary_generation_started") {
      setLLMStatus("Generating tracker data...", "generating");
      setStatus("Secondary LLM generating...");
      return;
    }
    if (obj?.type === "secondary_generation_complete") {
      setLLMStatus("Generation complete");
      const content = typeof obj.content === "string" ? obj.content : null;
      const messageId = typeof obj.messageId === "string" ? obj.messageId : null;
      if (content) handleContent(content, messageId);
      return;
    }
    if (obj?.type === "secondary_generation_error") {
      const msg = typeof obj.message === "string" ? obj.message : "Generation failed";
      setLLMStatus(msg, "error");
      return;
    }
    if (obj?.type === "tracker_history_latest") {
      const entry = obj.entry as { messageId?: unknown; payload?: unknown } | null;
      if (entry && typeof entry.payload === "string" && entry.payload.trim()) {
        const msgId = typeof entry.messageId === "string" ? entry.messageId : null;
        handleTrackerPayload(entry.payload, entry.payload, msgId);
      }
      return;
    }
    if (obj?.type === "permission_changed") {
      const allGranted = Array.isArray(obj.allGranted)
        ? obj.allGranted.filter((p): p is string => typeof p === "string")
        : grantedPermissions;
      grantedPermissions = allGranted;
      renderCapabilities(grantedPermissions, requestedPermissions, ephemeralPoolStatus);
      updatePermissionGatedControls();
      return;
    }
    if (obj?.type !== "config" || !obj.config || typeof obj.config !== "object") return;
    const incoming = obj.config as Record<string, unknown>;
    grantedPermissions = Array.isArray(obj.grantedPermissions)
      ? obj.grantedPermissions.filter((p): p is string => typeof p === "string")
      : grantedPermissions;
    requestedPermissions = Array.isArray(obj.requestedPermissions)
      ? obj.requestedPermissions.filter((p): p is string => typeof p === "string")
      : requestedPermissions;
    runtimeSeededPresets = Array.isArray(obj.seededPresets)
      ? (obj.seededPresets as TemplatePreset[])
      : runtimeSeededPresets;
    ephemeralPoolStatus = obj.ephemeralPoolStatus && typeof obj.ephemeralPoolStatus === "object"
      ? (obj.ephemeralPoolStatus as Record<string, unknown>)
      : null;
    config = {
      trackerTagName: typeof incoming.trackerTagName === "string" ? sanitizeTagName(incoming.trackerTagName) : DEFAULT_CONFIG.trackerTagName,
      codeBlockIdentifier: typeof incoming.codeBlockIdentifier === "string" ? sanitizeIdentifier(incoming.codeBlockIdentifier) : DEFAULT_CONFIG.codeBlockIdentifier,
      hideSimBlocks: typeof incoming.hideSimBlocks === "boolean" ? incoming.hideSimBlocks : DEFAULT_CONFIG.hideSimBlocks,
      templateId: typeof incoming.templateId === "string" ? incoming.templateId : DEFAULT_CONFIG.templateId,
      trackerFormat: incoming.trackerFormat === "yaml" ? "yaml" : "json",
      retainTrackerCount: typeof incoming.retainTrackerCount === "number" ? incoming.retainTrackerCount : DEFAULT_CONFIG.retainTrackerCount,
      enableInlineTemplates:
        typeof incoming.enableInlineTemplates === "boolean"
          ? incoming.enableInlineTemplates
          : DEFAULT_CONFIG.enableInlineTemplates,
      userPresets: Array.isArray(incoming.userPresets) ? (incoming.userPresets as TemplatePreset[]) : [],
      inlinePacks: Array.isArray(incoming.inlinePacks) ? (incoming.inlinePacks as Array<Record<string, unknown>>) : [],
      useSecondaryLLM: typeof incoming.useSecondaryLLM === "boolean" ? incoming.useSecondaryLLM : DEFAULT_CONFIG.useSecondaryLLM,
      secondaryLLMConnectionId: typeof incoming.secondaryLLMConnectionId === "string" ? incoming.secondaryLLMConnectionId : DEFAULT_CONFIG.secondaryLLMConnectionId,
      secondaryLLMModel: typeof incoming.secondaryLLMModel === "string" ? incoming.secondaryLLMModel : DEFAULT_CONFIG.secondaryLLMModel,
      secondaryLLMMessageCount: typeof incoming.secondaryLLMMessageCount === "number" ? incoming.secondaryLLMMessageCount : DEFAULT_CONFIG.secondaryLLMMessageCount,
      secondaryLLMTemperature: typeof incoming.secondaryLLMTemperature === "number" ? incoming.secondaryLLMTemperature : DEFAULT_CONFIG.secondaryLLMTemperature,
      secondaryLLMStripHTML: typeof incoming.secondaryLLMStripHTML === "boolean" ? incoming.secondaryLLMStripHTML : DEFAULT_CONFIG.secondaryLLMStripHTML,
    };
    configReady = true;
    if (configRetryTimer) {
      clearTimeout(configRetryTimer);
      configRetryTimer = null;
    }
    syncControls();
    configTrackerTagNameHint = config.trackerTagName;
    applyHideStyle();
    applyTagInterceptor();
    applyThemeClass(getPresetById(config, config.templateId));
    renderCapabilities(grantedPermissions, requestedPermissions, ephemeralPoolStatus);
    updatePermissionGatedControls();
    if (latestContent) {
      handleContent(latestContent);
    } else if (latestTrackerRaw) {
      handleTrackerPayload(latestTrackerRaw, latestTrackerSourceContent || latestTrackerRaw);
    } else if (pendingTrackerPayload) {
      const pending = pendingTrackerPayload;
      pendingTrackerPayload = null;
      handleTrackerPayload(pending.raw, pending.sourceContent, pending.messageId);
    }
    requestInitialTrackerRehydrate();
    inlineProcessor.processAll();
  });

  const runInlinePass = (messageId: string | null) => {
    if (messageId) inlineProcessor.processMessage(messageId);
    else inlineProcessor.processAll();
  };

  const rehydratedChatIds = new Set<string>();
  const extractChatId = (payload: unknown): string | null => {
    if (!payload || typeof payload !== "object") return null;
    const obj = payload as Record<string, unknown>;
    const direct = typeof obj.chatId === "string" ? obj.chatId : typeof obj.chat_id === "string" ? obj.chat_id : null;
    if (direct) return direct;
    const nested = obj.message as Record<string, unknown> | undefined;
    return typeof nested?.chatId === "string" ? nested.chatId : typeof nested?.chat_id === "string" ? nested.chat_id : null;
  };

  let currentChatId: string | null = null;
  const handleChatSwitch = (chatId: string | null) => {
    if (!chatId || chatId === currentChatId) return;
    currentChatId = chatId;
    resetChatState();
    renderEmpty("When a message includes a tracker tag, cards will appear here.");
    if (!rehydratedChatIds.has(chatId)) {
      rehydratedChatIds.add(chatId);
      ctx.sendToBackend({ type: "get_latest_tracker", chatId });
    }
    // Wait two frames for Lumiverse to finish painting the new chat's messages before scanning.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      renderTrackersFromDOM();
      inlineProcessor.processAll();
    }));
  };

  const onEvent = (payload: unknown) => {
    handleChatSwitch(extractChatId(payload));
    const context = readMessageContext(payload);
    if (!context) return;
    if (context.isUser === true) return;
    if (context.content) handleContent(context.content, context.messageId);
    runInlinePass(context.messageId);
  };

  const onSwipe = (payload: unknown) => {
    handleChatSwitch(extractChatId(payload));
    const context = readMessageContext(payload);
    if (!context) return;
    if (context.isUser === true) return;

    // Proactively clear all tracker renders on every swipe.
    // Historical swipes (content has tracker data) will re-render immediately below.
    // New-generation swipes (empty content) stay cleared until GENERATION_ENDED.
    clearSideTrackerRender();
    if (latestTrackerMessageId) {
      clearMessageTrackerRender(latestTrackerMessageId);
      inlineProcessor.clearMessage(latestTrackerMessageId);
    }
    if (context.messageId) inlineProcessor.clearMessage(context.messageId);
    previousTrackerData = null;
    latestTrackerRaw = null;
    latestTrackerSourceContent = null;
    latestContent = null;

    // If the swiped-to message already has content (historical), process it now.
    if (context.content) {
      handleContent(context.content, context.messageId);
    }
    runInlinePass(context.messageId);
  };

  const onMessageRendered = (payload: unknown) => {
    handleChatSwitch(extractChatId(payload));
    const context = readMessageContext(payload);
    if (!context || context.isUser === true) return;
    runInlinePass(context.messageId);
  };

  const renderTrackersFromDOM = () => {
    const messageNodes = Array.from(document.querySelectorAll("[data-message-id]"));
    for (const msgNode of messageNodes) {
      const msgId = msgNode.getAttribute("data-message-id");
      if (!msgId) continue;
      const preSel = `pre[data-code-lang="${config.codeBlockIdentifier}"]`;
      const preBlock = msgNode.querySelector(preSel);
      const raw = preBlock?.textContent?.trim() || "";
      if (raw) handleTrackerPayload(raw, raw, msgId);
    }
  };

  // Lumiverse virtualizes the message list (TanStack Virtual). Two failure
  // modes on scroll-back:
  //   1. Full remount — React rebuilds the bubble subtree and wipes the
  //      injected host. We re-inject from the cached render inputs.
  //   2. In-place reconciliation — host survives, but radios lose `:checked`
  //      state (see restoreFormControlState above).
  const observeTrackerHosts = (): (() => void) => {
    const pending = new Set<string>();
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      for (const id of pending) {
        const inputs = trackerMessageRenders.get(id);
        if (!inputs) continue;
        const messageNode = document.querySelector(`[data-message-id="${id}"]`);
        if (!messageNode) continue;
        const existingHost = document.querySelector(`[data-sst-message-tracker-id="${id}"]`);
        if (existingHost && existingHost.isConnected) {
          restoreFormControlState(existingHost);
          continue;
        }
        const tracked = trackerMessageMounts.get(id);
        if (tracked && !tracked.isConnected) trackerMessageMounts.delete(id);
        renderTrackerIntoMessage(id, inputs.data, inputs.preset, inputs.previousData, inputs.mode);
      }
      pending.clear();
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(flush);
    };
    const collectMessageIdsInNode = (node: Node): string[] => {
      const ids: string[] = [];
      if (!(node instanceof Element)) return ids;
      if (node.hasAttribute("data-message-id")) {
        const id = node.getAttribute("data-message-id");
        if (id) ids.push(id);
      }
      const nested = node.querySelectorAll?.("[data-message-id]");
      if (nested) {
        for (let i = 0; i < nested.length; i += 1) {
          const id = nested[i].getAttribute("data-message-id");
          if (id) ids.push(id);
        }
      }
      return ids;
    };
    const isOurHost = (node: Node): boolean =>
      node instanceof Element && node.hasAttribute?.("data-sst-message-tracker-id");
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // Skip mutations inside our own host — restoreFormControlState only
        // sets `.checked` properties (not attributes), so it doesn't trigger
        // mutation events; but template-internal label clicks or animations
        // shouldn't churn us either.
        if (m.target instanceof Element && m.target.closest?.("[data-sst-message-tracker-id]")) continue;
        if (m.type === "childList") {
          for (const node of Array.from(m.addedNodes)) {
            if (isOurHost(node)) continue;
            for (const id of collectMessageIdsInNode(node)) {
              if (trackerMessageRenders.has(id)) pending.add(id);
            }
          }
          for (const node of Array.from(m.removedNodes)) {
            if (isOurHost(node)) {
              const id = (node as Element).getAttribute("data-sst-message-tracker-id");
              if (id && trackerMessageRenders.has(id)) pending.add(id);
            }
          }
          // In-place reconciliation: any childList mutation inside a
          // tracker-bearing message subtree may have churned form state.
          if (m.target instanceof Element) {
            const msgHost = m.target.closest?.("[data-message-id]");
            const id = msgHost?.getAttribute?.("data-message-id");
            if (id && trackerMessageRenders.has(id)) pending.add(id);
          }
        } else if (m.type === "attributes" && m.target instanceof Element && m.attributeName === "data-message-id") {
          const id = m.target.getAttribute("data-message-id");
          if (id && trackerMessageRenders.has(id)) pending.add(id);
        }
      }
      if (pending.size > 0) schedule();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-message-id"],
    });
    return () => observer.disconnect();
  };

  const resetChatState = () => {
    previousTrackerData = null;
    latestTrackerMessageId = null;
    latestTrackerRaw = null;
    latestTrackerSourceContent = null;
    latestContent = null;
    trackerMessageIds.clear();
    for (const mount of trackerMessageMounts.values()) mount.remove();
    trackerMessageMounts.clear();
    trackerMessageRenders.clear();
    clearSideTrackerRender();
    inlineProcessor.destroy();
  };

  const generationUnsub = ctx.events.on("GENERATION_ENDED", onEvent);
  const messageUnsub = ctx.events.on("MESSAGE_SENT", onEvent);
  const messageEditedUnsub = ctx.events.on("MESSAGE_EDITED", onEvent);
  const messageSwipedUnsub = ctx.events.on("MESSAGE_SWIPED", onSwipe);
  const messageRenderedUnsub = ctx.events.on("CHARACTER_MESSAGE_RENDERED", onMessageRendered);

  const stopInlineObserver = inlineProcessor.observeDocument();
  stopTrackerObserver = observeTrackerHosts();

  const permissionUnsub = ctx.events.on("PERMISSION_CHANGED", (detail: unknown) => {
    if (!detail || typeof detail !== "object") return;
    const ev = detail as Record<string, unknown>;
    const allGranted = Array.isArray(ev.allGranted)
      ? ev.allGranted.filter((p): p is string => typeof p === "string")
      : null;
    if (allGranted) {
      grantedPermissions = allGranted;
      renderCapabilities(grantedPermissions, requestedPermissions, ephemeralPoolStatus);
      updatePermissionGatedControls();
    }
  });

  const saveButton = byId<HTMLElement>("sst-lumi-save");
  const templateSelect = byId<HTMLSelectElement>("sst-lumi-template");
  templateSelect?.addEventListener("change", () => {
    config = { ...config, templateId: templateSelect.value || DEFAULT_CONFIG.templateId };
    const preset = getPresetById(config, config.templateId);
    applyThemeClass(preset);
    const identifierInput = byId<HTMLInputElement>("sst-lumi-identifier");
    if (identifierInput && preset.extSettings?.codeBlockIdentifier) {
      identifierInput.value = String(preset.extSettings.codeBlockIdentifier);
    }
    if (latestContent) {
      handleContent(latestContent);
    } else if (latestTrackerRaw) {
      handleTrackerPayload(latestTrackerRaw, latestTrackerSourceContent || latestTrackerRaw);
    }
    inlineProcessor.processAll();
    setStatus(`Previewing template: ${preset.templateName}`);
  });

  saveButton?.addEventListener("click", () => {
    const templateSelectLocal = byId<HTMLSelectElement>("sst-lumi-template");
    const tagInput = byId<HTMLInputElement>("sst-lumi-tag");
    const identifierInput = byId<HTMLInputElement>("sst-lumi-identifier");
    const hideInput = byId<HTMLInputElement>("sst-lumi-hide");
    const inlineInput = byId<HTMLInputElement>("sst-lumi-inline");
    const formatSelect = byId<HTMLSelectElement>("sst-lumi-format");
    const retainInput = byId<HTMLInputElement>("sst-lumi-retain");

    const selectedTemplate = templateSelectLocal?.value || DEFAULT_CONFIG.templateId;
    const preset = getPresetById(config, selectedTemplate);
    const fallbackId = preset.extSettings?.codeBlockIdentifier;

    const llmEnable = byId<HTMLInputElement>("sst-lumi-llm-enable");
    const llmConnection = byId<HTMLSelectElement>("sst-lumi-llm-connection");
    const llmModel = byId<HTMLInputElement>("sst-lumi-llm-model");
    const llmMsgCount = byId<HTMLInputElement>("sst-lumi-llm-msgcount");
    const llmTemp = byId<HTMLInputElement>("sst-lumi-llm-temp");
    const llmStrip = byId<HTMLInputElement>("sst-lumi-llm-strip");

    config = {
      ...config,
      templateId: selectedTemplate,
      trackerTagName: sanitizeTagName(tagInput?.value || "tracker"),
      codeBlockIdentifier: sanitizeIdentifier(identifierInput?.value || fallbackId || "sim"),
      hideSimBlocks: Boolean(hideInput?.checked),
      enableInlineTemplates: Boolean(inlineInput?.checked),
      trackerFormat: formatSelect?.value === "yaml" ? "yaml" : "json",
      retainTrackerCount: sanitizeRetainCount(retainInput?.value || "3"),
      useSecondaryLLM: Boolean(llmEnable?.checked),
      secondaryLLMConnectionId: llmConnection?.value || "",
      secondaryLLMModel: sanitizeSecondaryLLMModel(llmModel?.value),
      secondaryLLMMessageCount: Math.max(1, Math.min(50, Math.floor(Number(llmMsgCount?.value) || 5))),
      secondaryLLMTemperature: Math.max(0, Math.min(2, Number(llmTemp?.value) || 0.7)),
      secondaryLLMStripHTML: Boolean(llmStrip?.checked),
    };
    persistConfig();
    configTrackerTagNameHint = config.trackerTagName;
    applyTagInterceptor();
    inlineProcessor.processAll();
    setStatus("Config saved");
  });

  const exportButton = byId<HTMLElement>("sst-lumi-export");
  exportButton?.addEventListener("click", () => {
    const preset = getPresetById(config, config.templateId);
    downloadJson(`${preset.templateName.replace(/\s+/g, "_").toLowerCase()}_preset.json`, preset);
    setStatus("Preset exported");
  });

  const pickAndImport = async (statusPrefix: string) => {
    try {
      const files = await ctx.uploads.pickFile({
        accept: ["application/json", ".json"],
        multiple: false,
        maxSizeBytes: 3 * 1024 * 1024,
      });
      const file = files[0];
      if (!file) return;
      const text = new TextDecoder().decode(file.bytes);
      ctx.sendToBackend({
        type: "import_preset_file",
        fileName: file.name,
        text,
      });
      setStatus(`${statusPrefix} ${file.name}...`);
    } catch {
      setStatus("Import cancelled");
    }
  };

  const importPackButton = byId<HTMLElement>("sst-lumi-import-pack");
  importPackButton?.addEventListener("click", () => {
    void pickAndImport("Importing pack");
  });

  const importButton = byId<HTMLElement>("sst-lumi-import");
  importButton?.addEventListener("click", () => {
    void pickAndImport("Importing");
  });

  const llmRefreshBtn = byId<HTMLElement>("sst-lumi-llm-refresh");
  llmRefreshBtn?.addEventListener("click", () => {
    ctx.sendToBackend({ type: "get_connections" });
    setLLMStatus("Refreshing connections...");
  });

  const llmConnectionSelect = byId<HTMLSelectElement>("sst-lumi-llm-connection");
  llmConnectionSelect?.addEventListener("change", () => {
    const selected = connections.find((c) => c.id === llmConnectionSelect.value);
    const modelInput = byId<HTMLInputElement>("sst-lumi-llm-model");
    if (modelInput) {
      modelInput.placeholder = selected?.model
        ? `Default: ${selected.model}`
        : "Leave empty to use connection default";
    }
  });

  void ctx.permissions.getGranted().then((granted) => {
    grantedPermissions = granted;
    renderCapabilities(grantedPermissions, requestedPermissions, ephemeralPoolStatus);
  }).catch(() => {
    renderCapabilities(grantedPermissions, requestedPermissions, ephemeralPoolStatus);
  });

  ctx.sendToBackend({ type: "get_config" });
  ctx.sendToBackend({ type: "get_connections" });
  updatePermissionGatedControls();
  setStatus("Loading config...");
  renderEmpty("When a message includes a tracker tag, cards will appear here.");

  // Retry config request after a short delay in case the backend is still
  // initializing following an extension update or host restart.
  let configRetryTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleConfigRetry = () => {
    if (configReady) return;
    configRetryTimer = setTimeout(() => {
      if (!configReady) {
        ctx.sendToBackend({ type: "get_config" });
        scheduleConfigRetry();
      }
    }, 2000);
  };
  scheduleConfigRetry();

  return () => {
    panelRoot = null;
    backendUnsub();
    generationUnsub();
    messageUnsub();
    messageEditedUnsub();
    messageSwipedUnsub();
    messageRenderedUnsub();
    stopInlineObserver();
    permissionUnsub();
    if (removeHideStyle) removeHideStyle();
    if (removeTagInterceptor) removeTagInterceptor();
    clearSideTrackerRender();
    for (const mount of trackerMessageMounts.values()) mount.remove();
    trackerMessageMounts.clear();
    trackerMessageRenders.clear();
    if (stopTrackerObserver) {
      stopTrackerObserver();
      stopTrackerObserver = null;
    }
    inlineProcessor.destroy();
    removePanelStyle();
    ctx.dom.cleanup();
    if (configRetryTimer) {
      clearTimeout(configRetryTimer);
      configRetryTimer = null;
    }
  };
}

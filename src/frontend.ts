import Handlebars from "handlebars";
import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { getTemplatePresets, type TemplatePreset } from "./templatePresets";
import { parseTrackerBlock, type TrackerData } from "./trackerData";

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
  .sst-side-tracker-root { width: 100%; height: 100%; position: relative; pointer-events: none; }
  .sst-side-tracker-root.sst-side-left { left: 0; }
  .sst-side-tracker-root.sst-side-right { right: 0; }
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

function parseInlineData(dataString: string): Record<string, unknown> | null {
  try {
    const decoded = dataString
      .replace(/<[^>]*>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
    const normalized = decoded.trim().replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    const parsed = JSON.parse(normalized) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function getAllInlineTemplates(config: TrackerConfig, preset: TemplatePreset): Array<Record<string, unknown>> {
  const templates: Array<Record<string, unknown>> = [];
  if (Array.isArray(preset.inlineTemplates)) {
    templates.push(...(preset.inlineTemplates as Array<Record<string, unknown>>));
  }
  for (const pack of config.inlinePacks) {
    const isEnabled = pack.enabled !== false;
    if (!isEnabled) continue;
    if (Array.isArray(pack.inlineTemplates)) {
      templates.push(...(pack.inlineTemplates as Array<Record<string, unknown>>));
    }
  }
  return templates;
}

function findInlineTemplate(config: TrackerConfig, preset: TemplatePreset, name: string): Record<string, unknown> | null {
  const all = getAllInlineTemplates(config, preset);
  return all.find((t) => t.insertName === name) || null;
}

const INLINE_TEMPLATE_REGEX = /\[\[(?:DISPLAY|D)=([^,\]]+),\s*DATA=(\{[\s\S]*?\})\s*\]\]/g;

function renderInlineDisplays(
  content: string,
  config: TrackerConfig,
  preset: TemplatePreset,
): Array<{ templateName: string; html: string; marker: string }> {
  const out: Array<{ templateName: string; html: string; marker: string }> = [];
  if (!config.enableInlineTemplates) return out;
  if (!content.includes("[[")) return out;

  const matches = [...content.matchAll(INLINE_TEMPLATE_REGEX)];
  for (const match of matches) {
    const name = (match[1] || "").trim();
    const dataRaw = match[2] || "{}";
    if (!name) continue;

    const templateDef = findInlineTemplate(config, preset, name);
    if (!templateDef || typeof templateDef.htmlContent !== "string") {
      out.push({ templateName: name, html: `<span style="color: orange;">[Unknown inline template: ${name}]</span>`, marker: match[0] || "" });
      continue;
    }

    const data = parseInlineData(dataRaw);
    if (!data) {
      out.push({ templateName: name, html: `<span style="color: red;">[Invalid inline template data: ${name}]</span>`, marker: match[0] || "" });
      continue;
    }

    try {
      const compiled = Handlebars.compile(templateDef.htmlContent);
      out.push({ templateName: name, html: compiled(data), marker: match[0] || "" });
    } catch {
      out.push({ templateName: name, html: `<span style="color: red;">[Inline render error: ${name}]</span>`, marker: match[0] || "" });
    }
  }

  return out;
}

function resolveTrackerMountMode(preset: TemplatePreset): TrackerMountMode {
  const fromPreset = typeof preset.templatePosition === "string" ? preset.templatePosition : "";
  const fromHtml = typeof preset.htmlTemplate === "string"
    ? (preset.htmlTemplate.match(/<!--\s*POSITION:\s*([A-Za-z_ -]+)\s*-->/i)?.[1] || "")
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

function extractTemplateLogic(htmlTemplate?: string): string | null {
  if (!htmlTemplate) return null;
  const scriptRegex = /<script\s+type=["']text\/x-handlebars-template-logic["'][^>]*>([\s\S]*?)<\/script>/i;
  const match = htmlTemplate.match(scriptRegex);
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

  const numericStats = ["ap", "dp", "tp", "cp", "affection", "desire", "trust", "contempt", "affinity", "health"];

  for (const current of currentCharacters) {
    const name = typeof current.name === "string" ? current.name : "Character";
    const prev = prevByName.get(name);
    if (!prev) {
      changes[name] = {};
      continue;
    }

    const out: Record<string, unknown> = {};
    for (const stat of numericStats) {
      const cur = current[stat];
      const old = prev[stat];
      if (typeof cur === "number" && typeof old === "number") {
        out[`${stat}Change`] = cur - old;
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
  Handlebars.registerHelper("gt", (a, b) => Number(a) > Number(b));
  Handlebars.registerHelper("gte", (a, b) => Number(a) >= Number(b));
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
  const raw = htmlTemplate || "";
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
    return {
      characterName: name,
      currentDate,
      currentTime,
      stats: {
        ...stats,
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

function renderInlineSection(
  inlineHtmlItems: Array<{ templateName: string; html: string; marker: string }>,
  injectSanitized: (html: string) => void,
): void {
  if (inlineHtmlItems.length === 0) return;
  const content = inlineHtmlItems
    .map((item) => `<div class="sst-inline-item" data-inline-template="${item.templateName}">${item.html}</div>`)
    .join("");
  injectSanitized(`<section class="sst-inline-section"><div class="sst-inline-title">Inline Displays</div>${content}</section>`);
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
  const trackerMessageIds = new Set<string>();
  const trackerMessageMounts = new Map<string, Element>();
  const inlineMessageArtifacts = new Map<string, { mounts: Element[]; slots: Element[] }>();
  let sideTrackerMount: Element | null = null;
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
    }
  };

  const clearInlineArtifacts = (messageId: string) => {
    const artifacts = inlineMessageArtifacts.get(messageId);
    if (!artifacts) return;
    for (const mount of artifacts.mounts) mount.remove();
    for (const slot of artifacts.slots) slot.remove();
    inlineMessageArtifacts.delete(messageId);
  };

  const clearSideTrackerRender = () => {
    if (!sideTrackerMount) return;
    sideTrackerMount.remove();
    sideTrackerMount = null;
  };

  const replaceFirstTokenInNodeHtml = (node: Element, marker: string, replacement: string): boolean => {
    if (!marker) return false;
    const html = node.innerHTML;
    if (!html.includes(marker)) return false;
    node.innerHTML = html.replace(marker, replacement);
    return true;
  };

  const renderInlineDisplaysInMessage = (
    messageId: string,
    sourceContent: string,
    preset: TemplatePreset,
  ) => {
    clearInlineArtifacts(messageId);
    const messageNode = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageNode) return;

    const inlineRenders = renderInlineDisplays(sourceContent, config, preset);
    if (inlineRenders.length === 0) return;

    const proseNodes = Array.from(messageNode.querySelectorAll("div[class*='prose']"));
    if (proseNodes.length === 0) return;

    const artifacts: { mounts: Element[]; slots: Element[] } = { mounts: [], slots: [] };
    for (let i = 0; i < inlineRenders.length; i += 1) {
      const item = inlineRenders[i];
      const slotId = `sst-inline-slot-${messageId}-${i}-${Date.now()}`;
      const slotHtml = `<span data-sst-inline-slot="${slotId}"></span>`;
      let inserted = false;

      for (const proseNode of proseNodes) {
        if (replaceFirstTokenInNodeHtml(proseNode, item.marker, slotHtml)) {
          inserted = true;
          break;
        }
      }
      if (!inserted) continue;

      const slot = messageNode.querySelector(`[data-sst-inline-slot="${slotId}"]`) as Element | null;
      if (!slot) continue;
      const mount = ctx.dom.inject(slot, item.html, "beforeend");
      artifacts.mounts.push(mount);
      artifacts.slots.push(slot);
    }

    if (artifacts.mounts.length > 0 || artifacts.slots.length > 0) {
      inlineMessageArtifacts.set(messageId, artifacts);
    }
  };

  const renderTrackerInSidebar = (
    data: TrackerData,
    preset: TemplatePreset,
    previousData: TrackerData | null,
    mode: TrackerMountMode,
  ) => {
    clearSideTrackerRender();
    const sidebarRoot = ctx.ui.mount("sidebar");
    if (!sidebarRoot) return;
    const markup = buildTrackerMarkup(data, preset, previousData);
    if (!markup.html) return;
    const sideClass = mode === "side_left" ? "sst-side-left" : "sst-side-right";
    const wrapped = `<div class="sst-side-tracker-root ${sideClass}">${markup.html}</div>`;
    sideTrackerMount = ctx.dom.inject(sidebarRoot, wrapped, "beforeend");
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
  };

  const handleTrackerPayload = (raw: string, sourceContent: string, messageId: string | null = null) => {
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
      if (messageId) clearInlineArtifacts(messageId);
      return;
    }
    setStatus(`Tracker updated (${preset.templateName})`);
    renderTracker(parsed, raw, preset, previousTrackerData, (html) => {
      injectIntoPanelBody(html);
    });
    if (mountMode === "side_left" || mountMode === "side_right") {
      renderTrackerInSidebar(parsed, preset, previousTrackerData, mountMode);
      if (messageId) clearMessageTrackerRender(messageId);
    } else if (messageId) {
      clearSideTrackerRender();
      renderTrackerIntoMessage(messageId, parsed, preset, previousTrackerData, mountMode);
      pruneNonLatestMessageTrackers();
    }

    if (messageId) {
      renderInlineDisplaysInMessage(messageId, sourceContent, preset);
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
        clearInlineArtifacts(messageId);
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
    syncControls();
    configTrackerTagNameHint = config.trackerTagName;
    applyHideStyle();
    applyTagInterceptor();
    applyThemeClass(getPresetById(config, config.templateId));
    renderCapabilities(grantedPermissions, requestedPermissions, ephemeralPoolStatus);
    if (latestContent) {
      handleContent(latestContent);
    }
  });

  const onEvent = (payload: unknown) => {
    const context = readMessageContext(payload);
    if (!context) return;
    if (context.isUser === true) return;
    if (context.content) handleContent(context.content, context.messageId);
  };

  const generationUnsub = ctx.events.on("GENERATION_ENDED", onEvent);
  const messageUnsub = ctx.events.on("MESSAGE_SENT", onEvent);
  const messageEditedUnsub = ctx.events.on("MESSAGE_EDITED", onEvent);
  const messageSwipedUnsub = ctx.events.on("MESSAGE_SWIPED", onEvent);

  const saveButton = byId<HTMLElement>("sst-lumi-save");
  const templateSelect = byId<HTMLSelectElement>("sst-lumi-template");
  templateSelect?.addEventListener("change", () => {
    config = { ...config, templateId: templateSelect.value || DEFAULT_CONFIG.templateId };
    applyThemeClass(getPresetById(config, config.templateId));
    if (latestContent) {
      handleContent(latestContent);
      setStatus(`Previewing template: ${getPresetById(config, config.templateId).templateName}`);
    }
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
      secondaryLLMModel: llmModel?.value?.trim() || "",
      secondaryLLMMessageCount: Math.max(1, Math.min(50, Math.floor(Number(llmMsgCount?.value) || 5))),
      secondaryLLMTemperature: Math.max(0, Math.min(2, Number(llmTemp?.value) || 0.7)),
      secondaryLLMStripHTML: Boolean(llmStrip?.checked),
    };
    persistConfig();
    configTrackerTagNameHint = config.trackerTagName;
    applyTagInterceptor();
    setStatus("Config saved");
  });

  const exportButton = byId<HTMLElement>("sst-lumi-export");
  exportButton?.addEventListener("click", () => {
    const preset = getPresetById(config, config.templateId);
    downloadJson(`${preset.templateName.replace(/\s+/g, "_").toLowerCase()}_preset.json`, preset);
    setStatus("Preset exported");
  });

  const importButton = byId<HTMLElement>("sst-lumi-import");
  importButton?.addEventListener("click", async () => {
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
      setStatus(`Importing ${file.name}...`);
    } catch {
      setStatus("Import cancelled");
    }
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
  applyHideStyle();
  applyTagInterceptor();
  setStatus("Ready");
  renderEmpty("When a message includes a tracker tag, cards will appear here.");

  return () => {
    panelRoot = null;
    backendUnsub();
    generationUnsub();
    messageUnsub();
    messageEditedUnsub();
    messageSwipedUnsub();
    if (removeHideStyle) removeHideStyle();
    if (removeTagInterceptor) removeTagInterceptor();
    clearSideTrackerRender();
    for (const mount of trackerMessageMounts.values()) mount.remove();
    trackerMessageMounts.clear();
    for (const artifacts of inlineMessageArtifacts.values()) {
      for (const mount of artifacts.mounts) mount.remove();
      for (const slot of artifacts.slots) slot.remove();
    }
    inlineMessageArtifacts.clear();
    removePanelStyle();
    ctx.dom.cleanup();
  };
}

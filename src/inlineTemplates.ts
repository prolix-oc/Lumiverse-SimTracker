import Handlebars from "handlebars";
import type { TemplatePreset } from "./templatePresets";

export type InlineProcessorConfig = {
  enableInlineTemplates: boolean;
  inlinePacks: Array<Record<string, unknown>>;
};

export type InlineProcessorDeps = {
  getConfig: () => InlineProcessorConfig;
  getPreset: () => TemplatePreset;
};

export type InlineProcessor = {
  processMessage: (messageId: string) => void;
  processAll: () => void;
  clearMessage: (messageId: string) => void;
  observeDocument: () => () => void;
  destroy: () => void;
};

type InlineTemplateDef = { insertName: string; htmlContent: string };

const LEGACY_MARKER_REGEX = /\[\[(?:DISPLAY|D)=([^,\]]+),\s*DATA=(\{[\s\S]*?\})\s*\]\]/g;
const INLINE_TAG = "sst-inline";
const MARKER_CLASS = "sst-inline-render";
const MAX_ITERATIONS = 32;

const templateCache = new Map<string, Handlebars.TemplateDelegate>();

function hashString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h.toString(36);
}

function compileInline(name: string, html: string): Handlebars.TemplateDelegate {
  const key = `${name}:${hashString(html)}`;
  let fn = templateCache.get(key);
  if (!fn) {
    fn = Handlebars.compile(html);
    templateCache.set(key, fn);
  }
  return fn;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderErrorSpan(name: string, reason: string, detail?: string): string {
  const suffix = detail ? ` ${escapeHtml(detail)}` : "";
  return `<span class="sst-inline-error" style="color:#e66;font-style:italic;">[${reason}: ${escapeHtml(name)}${suffix}]</span>`;
}

function collectInlineDefs(config: InlineProcessorConfig, preset: TemplatePreset): InlineTemplateDef[] {
  const out: InlineTemplateDef[] = [];
  const presetInline = (preset as unknown as Record<string, unknown>).inlineTemplates;
  if (Array.isArray(presetInline)) out.push(...(presetInline as InlineTemplateDef[]));
  for (const pack of config.inlinePacks) {
    if (pack && pack.enabled === false) continue;
    const packInline = (pack as Record<string, unknown>)?.inlineTemplates;
    if (Array.isArray(packInline)) out.push(...(packInline as InlineTemplateDef[]));
  }
  return out;
}

function parseJsonish(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
  const normalized = cleaned.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  try {
    const parsed = JSON.parse(normalized) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function renderTemplateHtml(
  name: string,
  data: Record<string, unknown>,
  def: InlineTemplateDef | null,
  allDefs: InlineTemplateDef[],
  config: InlineProcessorConfig,
): string {
  if (!def || typeof def.htmlContent !== "string") {
    const enabledPacks = config.inlinePacks.filter((p) => p && (p as Record<string, unknown>).enabled !== false).length;
    const detail = `(${enabledPacks} pack${enabledPacks === 1 ? "" : "s"}, ${allDefs.length} template${allDefs.length === 1 ? "" : "s"} loaded)`;
    return renderErrorSpan(name, "Unknown inline template", detail);
  }
  try {
    return compileInline(name, def.htmlContent)(data);
  } catch {
    return renderErrorSpan(name, "Inline render error");
  }
}

function buildContainer(name: string, html: string): HTMLSpanElement {
  const container = document.createElement("span");
  container.className = MARKER_CLASS;
  container.setAttribute("data-sst-inline-template", name);
  container.innerHTML = html;
  return container;
}

function collectTextNodes(root: Element): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = walker.nextNode();
  while (n) {
    out.push(n as Text);
    n = walker.nextNode();
  }
  return out;
}

type Locus = { node: Text; offset: number };

function locateOffset(nodes: Text[], globalOffset: number): Locus | null {
  let pos = 0;
  for (const node of nodes) {
    const len = (node.nodeValue ?? "").length;
    if (globalOffset <= pos + len) {
      return { node, offset: globalOffset - pos };
    }
    pos += len;
  }
  const last = nodes[nodes.length - 1];
  if (last && globalOffset === pos) return { node: last, offset: (last.nodeValue ?? "").length };
  return null;
}

function processTagElements(
  root: Element,
  config: InlineProcessorConfig,
  preset: TemplatePreset,
  artifacts: Element[],
): void {
  const tagNodes = Array.from(root.querySelectorAll(INLINE_TAG));
  if (tagNodes.length === 0) return;
  const allDefs = collectInlineDefs(config, preset);
  for (const el of tagNodes) {
    const name = (el.getAttribute("name") || el.getAttribute("template") || "").trim();
    if (!name) continue;
    const attrData = el.getAttribute("data");
    const dataRaw = attrData !== null && attrData !== "" ? attrData : (el.textContent ?? "{}");
    const data = parseJsonish(dataRaw);
    const def = allDefs.find((t) => t.insertName === name) ?? null;
    const rendered = data === null ? renderErrorSpan(name, "Invalid inline template data") : renderTemplateHtml(name, data, def, allDefs, config);
    const container = buildContainer(name, rendered);
    el.replaceWith(container);
    artifacts.push(container);
  }
}

function processLegacyMarkers(
  root: Element,
  config: InlineProcessorConfig,
  preset: TemplatePreset,
  artifacts: Element[],
): void {
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const textNodes = collectTextNodes(root);
    if (textNodes.length === 0) return;
    const fullText = textNodes.map((n) => n.nodeValue ?? "").join("");
    if (!fullText.includes("[[")) return;
    LEGACY_MARKER_REGEX.lastIndex = 0;
    const match = LEGACY_MARKER_REGEX.exec(fullText);
    if (!match) return;

    const startLoc = locateOffset(textNodes, match.index);
    const endLoc = locateOffset(textNodes, match.index + match[0].length);
    if (!startLoc || !endLoc) return;

    const name = (match[1] || "").trim();
    const data = parseJsonish(match[2] || "{}");
    const allDefs = collectInlineDefs(config, preset);
    const def = allDefs.find((t) => t.insertName === name) ?? null;
    const rendered = data === null ? renderErrorSpan(name, "Invalid inline template data") : renderTemplateHtml(name, data, def, allDefs, config);

    const range = document.createRange();
    try {
      range.setStart(startLoc.node, startLoc.offset);
      range.setEnd(endLoc.node, endLoc.offset);
    } catch {
      return;
    }
    range.deleteContents();
    const container = buildContainer(name, rendered);
    range.insertNode(container);
    artifacts.push(container);
  }
}

export function createInlineTemplateProcessor(deps: InlineProcessorDeps): InlineProcessor {
  const artifactsByMessage = new Map<string, Element[]>();

  const clearMessage = (messageId: string): void => {
    const list = artifactsByMessage.get(messageId);
    if (!list) return;
    for (const el of list) {
      if (el.isConnected) el.remove();
    }
    artifactsByMessage.delete(messageId);
  };

  const processMessage = (messageId: string): void => {
    if (!messageId) return;
    const config = deps.getConfig();
    clearMessage(messageId);
    if (!config.enableInlineTemplates) return;

    const messageNode = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageNode) return;

    const proseNodes = Array.from(messageNode.querySelectorAll("div[class*='prose']"));
    const roots = proseNodes.length > 0 ? proseNodes : [messageNode];

    const preset = deps.getPreset();
    const messageArtifacts: Element[] = [];
    for (const root of roots) {
      processTagElements(root, config, preset, messageArtifacts);
      processLegacyMarkers(root, config, preset, messageArtifacts);
    }

    if (messageArtifacts.length > 0) {
      artifactsByMessage.set(messageId, messageArtifacts);
    }
  };

  const processAll = (): void => {
    const hosts = Array.from(document.querySelectorAll("[data-message-id]"));
    for (const el of hosts) {
      const id = el.getAttribute("data-message-id");
      if (id) processMessage(id);
    }
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

  const observeDocument = (): (() => void) => {
    const pending = new Set<string>();
    let scheduled = false;
    const flush = () => {
      scheduled = false;
      for (const id of pending) {
        // Skip messages whose artifacts are still live — reprocessing would echo-loop.
        // If Lumiverse wiped our container (re-rendering prose), artifacts are disconnected
        // and we need to restore the render.
        const prior = artifactsByMessage.get(id);
        if (prior && prior.length > 0 && prior.some((el) => el.isConnected)) continue;
        processMessage(id);
      }
      pending.clear();
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(flush);
    };
    const isOurNode = (node: Node): boolean =>
      node instanceof Element && node.classList.contains("sst-inline-render");
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.target instanceof Element && m.target.closest?.(".sst-inline-render")) continue;
        if (m.type === "childList") {
          let added = 0;
          for (const node of Array.from(m.addedNodes)) {
            if (isOurNode(node)) continue;
            added += 1;
            for (const id of collectMessageIdsInNode(node)) pending.add(id);
          }
          let removed = 0;
          for (const node of Array.from(m.removedNodes)) {
            if (!isOurNode(node)) removed += 1;
          }
          if (added === 0 && removed === 0) continue;
          if (m.target instanceof Element && m.target.closest?.("[data-message-id]")) {
            const host = m.target.closest("[data-message-id]");
            const id = host?.getAttribute("data-message-id");
            if (id) pending.add(id);
          }
        } else if (m.type === "characterData" && m.target.parentNode instanceof Element) {
          const host = m.target.parentNode.closest("[data-message-id]");
          const id = host?.getAttribute("data-message-id");
          if (id) pending.add(id);
        } else if (m.type === "attributes" && m.target instanceof Element && m.attributeName === "data-message-id") {
          const id = m.target.getAttribute("data-message-id");
          if (id) pending.add(id);
        }
      }
      if (pending.size > 0) schedule();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["data-message-id"],
    });
    return () => observer.disconnect();
  };

  const destroy = (): void => {
    for (const id of Array.from(artifactsByMessage.keys())) clearMessage(id);
    artifactsByMessage.clear();
  };

  return { processMessage, processAll, clearMessage, observeDocument, destroy };
}

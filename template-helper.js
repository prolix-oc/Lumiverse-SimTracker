#!/usr/bin/env node
/**
 * Template Assembler & Extractor Helper
 * Usage:
 *   node template-helper.js extract <template.json> [--out-dir ./extracted/]
 *   node template-helper.js assemble <config.json> [--out ./output.json]
 *
 * Extract: Pulls html, sysPrompt, customFields, extSettings from a template JSON
 * Assemble: Builds a template JSON from HTML file + metadata files
 */

import fs from 'fs';
import path from 'path';

const CMD = process.argv[2];
const TARGET = process.argv[3];

function bail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!CMD || !TARGET) {
  bail(`Usage:
  node template-helper.js extract <template.json> [--out-dir ./extracted/]
  node template-helper.js assemble <config.json> [--out ./output.json]

Extract creates:
  extracted/<basename>/template.html
  extracted/<basename>/prompt.md
  extracted/<basename>/fields.json
  extracted/<basename>/settings.json
  extracted/<basename>/metadata.json

Assemble reads a config JSON like:
{
  "templateName": "My Tracker",
  "templateAuthor": "Author Name",
  "templatePosition": "BOTTOM",
  "htmlFile": "./my-tracker.html",
  "promptFile": "./prompt.md",
  "fieldsFile": "./fields.json",
  "settingsFile": "./settings.json",
  "trackerDesc": "description here"
}`);
}

// ─── EXTRACT ──────────────────────────────────────────────────────
if (CMD === 'extract') {
  const outDirFlag = process.argv.find((a, i) => a === '--out-dir' && process.argv[i + 1]);
  const outDir = outDirFlag ? process.argv[process.argv.indexOf('--out-dir') + 1] : './extracted';

  const src = fs.readFileSync(TARGET, 'utf-8');
  let data;
  try {
    data = JSON.parse(src);
  } catch (e) {
    bail(`Failed to parse ${TARGET}: ${e.message}`);
  }

  const base = path.basename(TARGET, '.json');
  const dest = path.join(outDir, base);
  fs.mkdirSync(dest, { recursive: true });

  // The htmlTemplate field stores raw HTML as a JSON string — JSON.parse
  // has already decoded any JSON-level escapes (\n, \", \\), so the value
  // is ready to write directly. Older builds of this script mistakenly
  // HTML-entity-escaped the template during `assemble` (treating JSON
  // embedding like HTML embedding), so fall back to decoding entities if
  // we detect that legacy format. Fresh assemblies produced by the fixed
  // `assemble` path won't contain entities and pass through unchanged.
  const html = data.htmlTemplate || '';
  const looksEntityEncoded = /&lt;|&gt;|&quot;|&#039;/.test(html) && !/<[a-zA-Z!]/.test(html);
  const rawHtml = looksEntityEncoded
    ? html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
    : html;

  fs.writeFileSync(path.join(dest, 'template.html'), rawHtml, 'utf-8');
  fs.writeFileSync(path.join(dest, 'prompt.md'), data.sysPrompt || '', 'utf-8');
  fs.writeFileSync(path.join(dest, 'fields.json'), JSON.stringify(data.customFields || [], null, 2), 'utf-8');
  fs.writeFileSync(path.join(dest, 'settings.json'), JSON.stringify(data.extSettings || {}, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dest, 'metadata.json'), JSON.stringify({
    templateName: data.templateName,
    templateAuthor: data.templateAuthor,
    templatePosition: data.templatePosition,
    trackerDesc: data.trackerDesc,
    tabsType: data.tabsType || undefined
  }, null, 2), 'utf-8');
  const unescaped = rawHtml; // back-compat alias for logging below

  // Also dump all keys recursively
  function allKeys(obj, prefix = '') {
    let keys = [];
    for (const [k, v] of Object.entries(obj)) {
      const p = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        keys = keys.concat(allKeys(v, p));
      } else {
        keys.push({ key: p, value: Array.isArray(v) ? `[Array(${v.length})]` : v });
      }
    }
    return keys;
  }

  const flatKeys = allKeys(data);
  fs.writeFileSync(path.join(dest, 'all-keys.txt'), flatKeys.map(k => `${k.key} = ${JSON.stringify(k.value).slice(0, 120)}`).join('\n'), 'utf-8');

  console.log(`Extracted to ${dest}/`);
  console.log(`  template.html  (${unescaped.length} chars)`);
  console.log(`  prompt.md      (${(data.sysPrompt || '').length} chars)`);
  console.log(`  fields.json    (${(data.customFields || []).length} fields)`);
  console.log(`  settings.json  (${Object.keys(data.extSettings || {}).length} keys)`);
  console.log(`  metadata.json`);
  console.log(`  all-keys.txt   (${flatKeys.length} total keys)`);
}

// ─── ASSEMBLE ────────────────────────────────────────────────────
else if (CMD === 'assemble') {
  const outIdx = process.argv.indexOf('--out');
  const outFlag = outIdx !== -1 ? process.argv[outIdx + 1] : null;

  const configSrc = fs.readFileSync(TARGET, 'utf-8');
  let config;
  try {
    config = JSON.parse(configSrc);
  } catch (e) {
    bail(`Failed to parse config ${TARGET}: ${e.message}`);
  }

  const readFile = (p) => {
    if (!p) return '';
    const resolved = path.resolve(path.dirname(TARGET), p);
    return fs.readFileSync(resolved, 'utf-8');
  };

  const htmlContent = readFile(config.htmlFile);
  const promptContent = readFile(config.promptFile);
  const fieldsContent = config.fieldsFile ? JSON.parse(readFile(config.fieldsFile)) : [];
  const settingsContent = config.settingsFile ? JSON.parse(readFile(config.settingsFile)) : {};

  // JSON.stringify handles all JSON-level escaping (newlines, quotes,
  // backslashes). The htmlTemplate field must contain the *raw* HTML —
  // the frontend template compiler searches for literal markers like
  // `<!-- CARD_TEMPLATE_START -->` and compiles real tags. Entity-escaping
  // (`&lt;`) here would render the template as inert text in the DOM.
  const output = {
    templateName: config.templateName || 'Untitled Tracker',
    templateAuthor: config.templateAuthor || 'Unknown',
    templatePosition: config.templatePosition || 'BOTTOM',
    tabsType: config.tabsType || undefined,
    htmlTemplate: htmlContent,
    sysPrompt: promptContent,
    customFields: fieldsContent,
    extSettings: settingsContent,
    trackerDesc: config.trackerDesc || ''
  };

  // Remove undefined keys
  Object.keys(output).forEach(key => {
    if (output[key] === undefined) delete output[key];
  });

  const outPath = outFlag || (config.outFile || './assembled-template.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Assembled template written to ${outPath}`);
  console.log(`  HTML: ${htmlContent.length} chars`);
  console.log(`  Prompt: ${promptContent.length} chars`);
  console.log(`  Fields: ${fieldsContent.length}`);
  console.log(`  Settings: ${Object.keys(settingsContent).length}`);
}

else {
  bail(`Unknown command: ${CMD}. Use 'extract' or 'assemble'.`);
}

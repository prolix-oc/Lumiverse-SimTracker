import bentoStyleTracker from "../tracker-card-templates/bento-style-tracker.json";
import datingCardTemplate from "../tracker-card-templates/dating-card-template.json";
import tacticalHudSidebarTabs from "../tracker-card-templates/tactical-hud-sidebar-tabs.json";
import rpgSidebarPreset from "../tracker-card-templates/rpg-sidebar-preset.json";
import pulseThreadTracker from "../tracker-card-templates/pulse-thread-tracker.json";

export type TemplateField = {
  key: string;
  description: string;
};

export type TemplatePreset = {
  id: string;
  templateName: string;
  templateAuthor?: string;
  htmlTemplate?: string;
  sysPrompt?: string;
  displayInstructions?: string;
  inlineTemplatesEnabled?: boolean;
  inlineTemplates?: unknown[];
  templatePosition?: string;
  customFields?: TemplateField[];
  extSettings?: {
    codeBlockIdentifier?: string;
    /** Compile once with `worldData` and the normalized `characters` array. */
    renderMode?: string;
    /** Optional display cap applied after character normalization. */
    maxCharacters?: number;
    [key: string]: unknown;
  };
};

const PRESETS: TemplatePreset[] = [
  {
    id: "bento-style-tracker",
    ...bentoStyleTracker,
  },
  {
    id: "dating-card-template",
    ...datingCardTemplate,
  },
  {
    id: "tactical-hud-sidebar-tabs",
    ...tacticalHudSidebarTabs,
  },
  {
    id: "rpg-sidebar-preset",
    ...rpgSidebarPreset,
  },
  {
    id: "pulse-thread-tracker",
    ...pulseThreadTracker,
  },
];

export function getTemplatePresets(): TemplatePreset[] {
  return PRESETS;
}

/**
 * Combine template sources without showing the same preset more than once.
 * Sources are ordered by precedence, so bundled presets take priority over
 * their storage-seeded copies.
 */
export function mergeTemplatePresets(...sources: readonly TemplatePreset[][]): TemplatePreset[] {
  const seenIds = new Set<string>();
  const presets: TemplatePreset[] = [];

  for (const source of sources) {
    for (const preset of source) {
      if (seenIds.has(preset.id)) continue;
      seenIds.add(preset.id);
      presets.push(preset);
    }
  }

  return presets;
}

export function getTemplatePresetById(id: string): TemplatePreset {
  return PRESETS.find((preset) => preset.id === id) || PRESETS[0];
}

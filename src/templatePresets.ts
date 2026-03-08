import bentoStyleTracker from "../tracker-card-templates/bento-style-tracker.json";
import datingCardTemplate from "../tracker-card-templates/dating-card-template.json";
import tacticalHudSidebarTabs from "../tracker-card-templates/tactical-hud-sidebar-tabs.json";

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
];

export function getTemplatePresets(): TemplatePreset[] {
  return PRESETS;
}

export function getTemplatePresetById(id: string): TemplatePreset {
  return PRESETS.find((preset) => preset.id === id) || PRESETS[0];
}

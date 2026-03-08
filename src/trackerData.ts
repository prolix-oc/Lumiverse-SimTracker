import { parse as parseYaml } from "yaml";

export type CharacterRecord = Record<string, unknown>;

export type TrackerData = {
  worldData?: Record<string, unknown>;
  characters?: CharacterRecord[];
  [key: string]: unknown;
};

function cleanupPlusSigns(input: string): string {
  return input.replace(/([\s:[,{])\+(\d+(?:\.\d+)?)([\s,}\]\n\r]|$)/g, "$1$2$3");
}

export function parseTrackerBlock(raw: string): TrackerData | null {
  const cleaned = cleanupPlusSigns(raw.trim());
  if (!cleaned) return null;

  try {
    const json = JSON.parse(cleaned) as unknown;
    if (json && typeof json === "object") {
      return normalizeTrackerData(json as TrackerData);
    }
  } catch {
    // Not JSON; try YAML.
  }

  try {
    const yaml = parseYaml(cleaned) as unknown;
    if (yaml && typeof yaml === "object") {
      return normalizeTrackerData(yaml as TrackerData);
    }
  } catch {
    return null;
  }

  return null;
}

export function normalizeTrackerData(data: TrackerData): TrackerData {
  if (Array.isArray(data.characters)) {
    return data;
  }

  const characters: CharacterRecord[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === "worldData") continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      characters.push({ name: key, ...(value as CharacterRecord) });
    }
  }

  return {
    ...data,
    characters,
  };
}

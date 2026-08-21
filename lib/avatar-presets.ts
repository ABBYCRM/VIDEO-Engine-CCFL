// Read-side layer over data/avatar-presets.json. The DB holds the canonical
// avatar rows (id, name, gender, reference_image_path, view file paths, status)
// seeded from this file. The richer editorial fields (notes, wardrobeStandard,
// referenceImageNote, wardrobeRegenerationPrompt) live here in JSON so the
// generator + campaign planner can pull them without a DB query.

import fs from "node:fs";
import path from "node:path";

export type AvatarPreset = {
  id: string;
  name: string;
  gender: "male" | "female" | "non-binary";
  archetype: string;
  wardrobeStandard: string;
  notes: string;
  referenceImage?: string | null;
  referenceImageNote?: string;
  wardrobeRegenerationPrompt?: string;
  views?: Record<string, string | null>;
};

let cache: AvatarPreset[] | null = null;

export function loadPresets(): AvatarPreset[] {
  if (cache) return cache;
  try {
    const file = path.resolve(process.cwd(), "data/avatar-presets.json");
    const raw = fs.readFileSync(file, "utf8");
    cache = JSON.parse(raw) as AvatarPreset[];
    return cache;
  } catch {
    return [];
  }
}

export function getPreset(id: string): AvatarPreset | null {
  return loadPresets().find((p) => p.id === id) || null;
}

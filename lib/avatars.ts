// Avatar catalog. Backed by SQLite (avatars + avatar_views tables), seeded from
// data/avatar-presets.json on first run. Provides the public read shape used
// by the /avatars page and the API routes.

import { db } from "@/lib/db";
import { getPreset } from "@/lib/avatar-presets";

export type AvatarStatus = "draft" | "ready" | "archived";

export type AvatarView = "front" | "left" | "right" | "back";
export const VIEWS: AvatarView[] = ["front", "left", "right", "back"];

export type Avatar = {
  id: string;
  name: string;
  gender: "male" | "female" | "non-binary";
  archetype: string;
  wardrobeStandard: string;
  notes: string;
  referenceImage: string | null;
  status: AvatarStatus;
  views: Record<AvatarView, { file: string | null; status: "ready" | "missing" }>;
};

const VIEWS_WHERE = "(" + VIEWS.map(() => "?").join(",") + ")";

function readViewsForAvatars(ids: string[]): Map<string, Avatar["views"]> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`SELECT avatar_id,view,file_path,status FROM avatar_views WHERE avatar_id IN (${placeholders})`)
    .all(...ids) as Array<{ avatar_id: string; view: string; file_path: string | null; status: string }>;
  const out = new Map<string, Avatar["views"]>();
  for (const id of ids) {
    out.set(id, {
      front: { file: null, status: "missing" },
      left: { file: null, status: "missing" },
      right: { file: null, status: "missing" },
      back: { file: null, status: "missing" }
    });
  }
  for (const r of rows) {
    const block = out.get(r.avatar_id);
    if (!block) continue;
    if (VIEWS.includes(r.view as AvatarView)) {
      (block as Record<string, { file: string | null; status: "ready" | "missing" }>)[r.view] = {
        file: r.file_path,
        status: r.status === "ready" ? "ready" : "missing"
      };
    }
  }
  return out;
}

export function listAvatars(): PublicAvatar[] {
  const rows = db
    .prepare("SELECT id,name,gender,archetype,wardrobe_standard,notes,reference_image_path,status FROM avatars ORDER BY name")
    .all() as Array<{
      id: string;
      name: string;
      gender: string;
      archetype: string;
      wardrobe_standard: string;
      notes: string;
      reference_image_path: string | null;
      status: string;
    }>;
  const ids = rows.map((r) => r.id);
  const views = readViewsForAvatars(ids);
  return rows.map((r) => enrich({
    id: r.id,
    name: r.name,
    gender: r.gender as Avatar["gender"],
    archetype: r.archetype,
    wardrobeStandard: r.wardrobe_standard,
    notes: r.notes,
    referenceImage: r.reference_image_path,
    status: (r.status as AvatarStatus) || "draft",
    views: views.get(r.id) || {
      front: { file: null, status: "missing" },
      left: { file: null, status: "missing" },
      right: { file: null, status: "missing" },
      back: { file: null, status: "missing" }
    }
  }));
}

export function getAvatar(id: string): PublicAvatar | null {
  const row = db
    .prepare("SELECT id,name,gender,archetype,wardrobe_standard,notes,reference_image_path,status FROM avatars WHERE id=?")
    .get(id) as {
    id: string;
    name: string;
    gender: string;
    archetype: string;
    wardrobe_standard: string;
    notes: string;
    reference_image_path: string | null;
    status: string;
  } | undefined;
  if (!row) return null;
  const views = readViewsForAvatars([id]).get(id) || {
    front: { file: null, status: "missing" },
    left: { file: null, status: "missing" },
    right: { file: null, status: "missing" },
    back: { file: null, status: "missing" }
  };
  return enrich({
    id: row.id,
    name: row.name,
    gender: row.gender as Avatar["gender"],
    archetype: row.archetype,
    wardrobeStandard: row.wardrobe_standard,
    notes: row.notes,
    referenceImage: row.reference_image_path,
    status: (row.status as AvatarStatus) || "draft",
    views
  });
}

export function updateAvatarReference(id: string, path: string | null): boolean {
  const result = db
    .prepare(
      "UPDATE avatars SET reference_image_path=?, status=CASE WHEN ? IS NULL THEN 'draft' ELSE 'ready' END, updated_at=CURRENT_TIMESTAMP WHERE id=?"
    )
    .run(path, path, id);
  return result.changes > 0;
}

export function updateAvatarView(avatarId: string, view: AvatarView, path: string | null): boolean {
  const result = db
    .prepare(
      "UPDATE avatar_views SET file_path=?, status=CASE WHEN ? IS NULL THEN 'missing' ELSE 'ready' END, updated_at=CURRENT_TIMESTAMP WHERE avatar_id=? AND view=?"
    )
    .run(path, path, avatarId, view);
  return result.changes > 0;
}

export function deleteAvatar(id: string): boolean {
  db.prepare("DELETE FROM avatar_views WHERE avatar_id=?").run(id);
  const r = db.prepare("DELETE FROM avatars WHERE id=?").run(id);
  return r.changes > 0;
}

export function createAvatar(input: {
  id: string;
  name: string;
  gender: Avatar["gender"];
  archetype: string;
  wardrobeStandard: string;
  notes?: string;
}): Avatar {
  db.prepare(
    "INSERT INTO avatars(id,name,gender,archetype,wardrobe_standard,notes,status) VALUES(?,?,?,?,?,?, 'draft')"
  ).run(input.id, input.name, input.gender, input.archetype, input.wardrobeStandard, input.notes || "");
  const insertView = db.prepare("INSERT INTO avatar_views(avatar_id,view,file_path,status) VALUES(?,?,?, 'missing')");
  for (const v of VIEWS) insertView.run(input.id, v);
  return getAvatar(input.id)!;
}

// Read-only shape returned to the API. Mirrors the page's needs.
export type PublicAvatar = {
  id: string;
  name: string;
  gender: Avatar["gender"];
  archetype: string;
  wardrobeStandard: string;
  notes: string;
  referenceImage: string | null;
  referenceImageNote: string | null;
  wardrobeRegenerationPrompt: string | null;
  status: AvatarStatus;
  views: Record<AvatarView, { file: string | null; status: "ready" | "missing" }>;
};

// Enrich a DB Avatar with the editorial fields from data/avatar-presets.json
// so the page can show notes, the identity-reference warning, and the
// wardrobe-regeneration prompt in one shape.
export function enrich(a: Avatar): PublicAvatar {
  const preset = getPreset(a.id);
  return {
    ...a,
    referenceImageNote: preset?.referenceImageNote ?? null,
    wardrobeRegenerationPrompt: preset?.wardrobeRegenerationPrompt ?? null
  };
}

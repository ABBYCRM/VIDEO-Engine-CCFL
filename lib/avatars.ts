// Avatar catalog. Backed by SQLite (avatars + avatar_views tables), seeded from
// data/avatar-presets.json on first run. Provides the public read shape used
// by the /avatars page and the API routes.

import { db } from "@/lib/db";
import { getPreset } from "@/lib/avatar-presets";

export type AvatarStatus = "draft" | "ready" | "archived";
export type TurnaroundStatus = "draft" | "generating" | "incomplete" | "ready" | "failed";
export type ViewGenStatus = "idle" | "generating" | "ready" | "failed";

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
  turnaroundStatus: TurnaroundStatus;
  turnaroundModel: string | null;
  turnaroundStartedAt: string | null;
  turnaroundFinishedAt: string | null;
  turnaroundError: string | null;
  views: Record<AvatarView, {
    file: string | null;
    status: "ready" | "missing";
    generationStatus: ViewGenStatus;
    generationModel: string | null;
    generationError: string | null;
  }>;
};

function readViewsForAvatars(ids: string[]): Map<string, Avatar["views"]> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT avatar_id,view,file_path,status,generation_status,generation_model,generation_error
       FROM avatar_views WHERE avatar_id IN (${placeholders})`
    )
    .all(...ids) as Array<{
      avatar_id: string; view: string; file_path: string | null; status: string;
      generation_status: string; generation_model: string | null; generation_error: string | null;
    }>;
  const out = new Map<string, Avatar["views"]>();
  for (const id of ids) {
    out.set(id, {
      front: emptyView(),
      left: emptyView(),
      right: emptyView(),
      back: emptyView()
    });
  }
  for (const r of rows) {
    const block = out.get(r.avatar_id);
    if (!block) continue;
    if (VIEWS.includes(r.view as AvatarView)) {
      (block as Record<string, Avatar["views"][AvatarView]>)[r.view as AvatarView] = {
        file: r.file_path,
        status: r.status === "ready" ? "ready" : "missing",
        generationStatus: (["idle", "generating", "ready", "failed"] as const).includes(r.generation_status as ViewGenStatus)
          ? r.generation_status as ViewGenStatus
          : "idle",
        generationModel: r.generation_model,
        generationError: r.generation_error
      };
    }
  }
  return out;
}

function emptyView(): Avatar["views"][AvatarView] {
  return { file: null, status: "missing", generationStatus: "idle", generationModel: null, generationError: null };
}

export function listAvatars(): PublicAvatar[] {
  const rows = db
    .prepare(
      "SELECT id,name,gender,archetype,wardrobe_standard,notes,reference_image_path,status,turnaround_status,turnaround_model,turnaround_started_at,turnaround_finished_at,turnaround_error FROM avatars ORDER BY name"
    )
    .all() as Array<{
      id: string; name: string; gender: string; archetype: string; wardrobe_standard: string;
      notes: string; reference_image_path: string | null; status: string;
      turnaround_status: string; turnaround_model: string | null;
      turnaround_started_at: string | null; turnaround_finished_at: string | null; turnaround_error: string | null;
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
    turnaroundStatus: (r.turnaround_status as TurnaroundStatus) || "draft",
    turnaroundModel: r.turnaround_model,
    turnaroundStartedAt: r.turnaround_started_at,
    turnaroundFinishedAt: r.turnaround_finished_at,
    turnaroundError: r.turnaround_error,
    views: views.get(r.id) || {
      front: emptyView(), left: emptyView(), right: emptyView(), back: emptyView()
    }
  }));
}

export function getAvatar(id: string): PublicAvatar | null {
  const row = db
    .prepare(
      "SELECT id,name,gender,archetype,wardrobe_standard,notes,reference_image_path,status,turnaround_status,turnaround_model,turnaround_started_at,turnaround_finished_at,turnaround_error FROM avatars WHERE id=?"
    )
    .get(id) as {
      id: string; name: string; gender: string; archetype: string; wardrobe_standard: string;
      notes: string; reference_image_path: string | null; status: string;
      turnaround_status: string; turnaround_model: string | null;
      turnaround_started_at: string | null; turnaround_finished_at: string | null; turnaround_error: string | null;
    } | undefined;
  if (!row) return null;
  const views = readViewsForAvatars([id]).get(id) || {
    front: emptyView(), left: emptyView(), right: emptyView(), back: emptyView()
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
    turnaroundStatus: (row.turnaround_status as TurnaroundStatus) || "draft",
    turnaroundModel: row.turnaround_model,
    turnaroundStartedAt: row.turnaround_started_at,
    turnaroundFinishedAt: row.turnaround_finished_at,
    turnaroundError: row.turnaround_error,
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
  turnaroundStatus: TurnaroundStatus;
  turnaroundModel: string | null;
  turnaroundStartedAt: string | null;
  turnaroundFinishedAt: string | null;
  turnaroundError: string | null;
  views: Record<AvatarView, {
    file: string | null;
    status: "ready" | "missing";
    generationStatus: ViewGenStatus;
    generationModel: string | null;
    generationError: string | null;
  }>;
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

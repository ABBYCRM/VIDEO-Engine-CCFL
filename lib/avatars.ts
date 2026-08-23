// Avatar catalog. Backed by SQLite (avatars + avatar_views tables), seeded from
// data/avatar-presets.json on first run. Provides the public read shape used
// by the /avatars page and the API routes.

import { db } from "@/lib/db";
import { getPreset } from "@/lib/avatar-presets";

export type AvatarStatus = "draft" | "ready" | "archived";
export type TurnaroundStatus = "draft" | "generating" | "incomplete" | "ready" | "failed";
export type ViewGenStatus = "idle" | "generating" | "ready" | "failed";
export type A2eTwinStatus = "idle" | "training" | "ready" | "failed";

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
  a2eTwinId: string | null;
  a2eTwinAnchorId: string | null;
  a2eTwinStatus: A2eTwinStatus;
  a2eTwinError: string | null;
  a2eTwinStartedAt: string | null;
  a2eTwinFinishedAt: string | null;
  views: Record<AvatarView, {
    file: string | null;
    status: "ready" | "missing";
    generationStatus: ViewGenStatus;
    generationModel: string | null;
    generationError: string | null;
  }>;
};

type AvatarRow = {
  id: string;
  name: string;
  gender: string;
  archetype: string;
  wardrobe_standard: string;
  notes: string;
  reference_image_path: string | null;
  status: string;
  turnaround_status: string;
  turnaround_model: string | null;
  turnaround_started_at: string | null;
  turnaround_finished_at: string | null;
  turnaround_error: string | null;
  a2e_twin_id: string | null;
  a2e_twin_anchor_id: string | null;
  a2e_twin_status: string | null;
  a2e_twin_error: string | null;
  a2e_twin_started_at: string | null;
  a2e_twin_finished_at: string | null;
};

const AVATAR_SELECT = `id,name,gender,archetype,wardrobe_standard,notes,reference_image_path,status,
  turnaround_status,turnaround_model,turnaround_started_at,turnaround_finished_at,turnaround_error,
  a2e_twin_id,a2e_twin_anchor_id,a2e_twin_status,a2e_twin_error,a2e_twin_started_at,a2e_twin_finished_at`;

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

function validTwinStatus(value: string | null | undefined): A2eTwinStatus {
  return value === "training" || value === "ready" || value === "failed" ? value : "idle";
}

function rowToAvatar(row: AvatarRow, views: Avatar["views"]): Avatar {
  return {
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
    a2eTwinId: row.a2e_twin_id,
    a2eTwinAnchorId: row.a2e_twin_anchor_id,
    a2eTwinStatus: validTwinStatus(row.a2e_twin_status),
    a2eTwinError: row.a2e_twin_error,
    a2eTwinStartedAt: row.a2e_twin_started_at,
    a2eTwinFinishedAt: row.a2e_twin_finished_at,
    views
  };
}

export function listAvatars(): PublicAvatar[] {
  const rows = db.prepare(`SELECT ${AVATAR_SELECT} FROM avatars ORDER BY name`).all() as AvatarRow[];
  const ids = rows.map((r) => r.id);
  const views = readViewsForAvatars(ids);
  return rows.map((row) => enrich(rowToAvatar(row, views.get(row.id) || {
    front: emptyView(), left: emptyView(), right: emptyView(), back: emptyView()
  })));
}

export function getAvatar(id: string): PublicAvatar | null {
  const row = db.prepare(`SELECT ${AVATAR_SELECT} FROM avatars WHERE id=?`).get(id) as AvatarRow | undefined;
  if (!row) return null;
  const views = readViewsForAvatars([id]).get(id) || {
    front: emptyView(), left: emptyView(), right: emptyView(), back: emptyView()
  };
  return enrich(rowToAvatar(row, views));
}

export function updateAvatarReference(id: string, path: string | null): boolean {
  const result = db
    .prepare(
      `UPDATE avatars SET
        reference_image_path=?,
        status=CASE WHEN ? IS NULL THEN 'draft' ELSE 'ready' END,
        a2e_twin_id=NULL,
        a2e_twin_anchor_id=NULL,
        a2e_twin_status='idle',
        a2e_twin_error=NULL,
        a2e_twin_started_at=NULL,
        a2e_twin_finished_at=NULL,
        updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
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

export function markAvatarTwinTraining(id: string, trainingId: string) {
  const result = db.prepare(
    `UPDATE avatars SET a2e_twin_id=?,a2e_twin_anchor_id=NULL,a2e_twin_status='training',a2e_twin_error=NULL,
      a2e_twin_started_at=CURRENT_TIMESTAMP,a2e_twin_finished_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(trainingId, id);
  return result.changes > 0;
}

export function markAvatarTwinReady(id: string, twinId: string, anchorId: string) {
  const result = db.prepare(
    `UPDATE avatars SET a2e_twin_id=?,a2e_twin_anchor_id=?,a2e_twin_status='ready',a2e_twin_error=NULL,
      a2e_twin_finished_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(twinId, anchorId, id);
  return result.changes > 0;
}

export function markAvatarTwinFailed(id: string, error: string) {
  const result = db.prepare(
    `UPDATE avatars SET a2e_twin_status='failed',a2e_twin_error=?,a2e_twin_finished_at=CURRENT_TIMESTAMP,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(error.slice(0, 2000), id);
  return result.changes > 0;
}

export function clearAvatarTwin(id: string) {
  const result = db.prepare(
    `UPDATE avatars SET a2e_twin_id=NULL,a2e_twin_anchor_id=NULL,a2e_twin_status='idle',a2e_twin_error=NULL,
      a2e_twin_started_at=NULL,a2e_twin_finished_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).run(id);
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
  a2eTwinId: string | null;
  a2eTwinAnchorId: string | null;
  a2eTwinStatus: A2eTwinStatus;
  a2eTwinError: string | null;
  a2eTwinStartedAt: string | null;
  a2eTwinFinishedAt: string | null;
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

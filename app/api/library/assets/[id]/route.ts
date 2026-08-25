import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteGeneratedImage } from "@/lib/media-library";
import { deletePersistentLibraryAsset } from "@/lib/persistent-library";

async function unlinkIfLocal(filePath: string | null | undefined) {
  if (!filePath || !filePath.startsWith("/")) return;
  if (filePath.startsWith("/api/")) return;
  await fs.unlink(path.resolve(process.cwd(), "public", filePath.slice(1))).catch(() => {});
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (id.startsWith("avatar:")) return NextResponse.json({ error: "Avatar assets are managed from Avatars, not Library." }, { status: 400 });

  if (id.startsWith("generated:")) {
    await deleteGeneratedImage(id.slice("generated:".length));
  } else if (id.startsWith("video:")) {
    const jobId = id.slice("video:".length);
    const row = db.prepare("SELECT output_path FROM video_jobs WHERE id=?").get(jobId) as { output_path: string | null } | undefined;
    db.prepare("DELETE FROM video_jobs WHERE id=?").run(jobId);
    await deletePersistentLibraryAsset(id).catch(() => {});
    if (row?.output_path) await fs.unlink(row.output_path).catch(() => {});
  } else if (id.startsWith("composition:")) {
    const compositionId = id.slice("composition:".length);
    const row = db.prepare("SELECT file_path FROM generated_compositions WHERE id=?").get(compositionId) as { file_path: string | null } | undefined;
    db.prepare("DELETE FROM generated_compositions WHERE id=?").run(compositionId);
    await deletePersistentLibraryAsset(id).catch(() => {});
    await unlinkIfLocal(row?.file_path);
  } else {
    await deletePersistentLibraryAsset(id).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}

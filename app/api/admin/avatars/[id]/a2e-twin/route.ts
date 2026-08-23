import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  clearAvatarTwin,
  getAvatar,
  markAvatarTwinFailed,
  markAvatarTwinReady,
  markAvatarTwinTraining
} from "@/lib/avatars";
import { pollTwinTraining, startTwinTraining } from "@/lib/a2e-twin";

const AVATARS_ROOT = path.resolve(process.cwd(), "public", "avatars");
const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

function sourceForAvatar(avatar: NonNullable<ReturnType<typeof getAvatar>>) {
  if (avatar.views.front?.status === "ready" && avatar.views.front.file) {
    return { view: "front" as const, storedPath: avatar.views.front.file };
  }
  if (avatar.wardrobeRegenerationPrompt) {
    throw new Error(
      `${avatar.name} cannot train an A2E Video Twin from the identity-only reference. Generate or upload the campaign-safe canonical front view first.`
    );
  }
  if (avatar.referenceImage) return { view: "reference" as const, storedPath: avatar.referenceImage };
  throw new Error(`${avatar.name} has no usable image for A2E Video Twin training.`);
}

function resolveAvatarFile(id: string, storedPath: string) {
  const resolved = path.resolve(AVATARS_ROOT, id, path.basename(storedPath));
  if (!resolved.startsWith(AVATARS_ROOT + path.sep)) throw new Error("Invalid avatar source path");
  return resolved;
}

async function syncTwin(id: string) {
  const avatar = getAvatar(id);
  if (!avatar) return { avatar: null, changed: false };
  if (avatar.a2eTwinStatus !== "training" || !avatar.a2eTwinId) return { avatar, changed: false };
  try {
    const result = await pollTwinTraining(avatar.a2eTwinId);
    if (!result.done) return { avatar, changed: false };
    if (result.status === "failed") markAvatarTwinFailed(id, result.error);
    else markAvatarTwinReady(id, result.twinId, result.anchorId);
  } catch (error) {
    markAvatarTwinFailed(id, error instanceof Error ? error.message : String(error));
  }
  return { avatar: getAvatar(id), changed: true };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const current = getAvatar(id);
  if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { avatar } = await syncTwin(id);
  return NextResponse.json({
    twin: avatar ? {
      id: avatar.a2eTwinId,
      anchorId: avatar.a2eTwinAnchorId,
      status: avatar.a2eTwinStatus,
      error: avatar.a2eTwinError,
      startedAt: avatar.a2eTwinStartedAt,
      finishedAt: avatar.a2eTwinFinishedAt
    } : null
  });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const avatar = getAvatar(id);
  if (!avatar) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (avatar.a2eTwinStatus === "training") {
    const { avatar: synced } = await syncTwin(id);
    if (synced?.a2eTwinStatus === "training") {
      return NextResponse.json({
        twin: { id: synced.a2eTwinId, anchorId: synced.a2eTwinAnchorId, status: synced.a2eTwinStatus, error: synced.a2eTwinError }
      }, { status: 202 });
    }
    if (synced?.a2eTwinStatus === "ready") {
      return NextResponse.json({
        twin: { id: synced.a2eTwinId, anchorId: synced.a2eTwinAnchorId, status: synced.a2eTwinStatus, error: null }
      });
    }
  }

  try {
    const source = sourceForAvatar(avatar);
    const filePath = resolveAvatarFile(id, source.storedPath);
    const bytes = await fs.promises.readFile(filePath);
    const mime = MIME_BY_EXT[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    if (!mime.startsWith("image/")) throw new Error("A2E Video Twin source must be PNG, JPEG, or WebP.");
    const trainingId = await startTwinTraining({
      name: `${avatar.name} · VIDEO-Engine`,
      gender: avatar.gender,
      imageBase64: bytes.toString("base64"),
      imageMimeType: mime
    });
    markAvatarTwinTraining(id, trainingId);
    return NextResponse.json({
      twin: { id: trainingId, anchorId: null, status: "training", error: null },
      sourceView: source.view
    }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    markAvatarTwinFailed(id, message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!getAvatar(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  clearAvatarTwin(id);
  return NextResponse.json({ ok: true });
}

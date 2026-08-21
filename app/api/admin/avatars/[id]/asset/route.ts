// Streams avatar asset files (reference image or 4-view slot) from disk.
// Why this exists: Next.js standalone build bakes /public at build time, so files
// written at runtime (via the upload route) are not served by the static handler.
// This route reads from /data/avatars/<id>/<filename>, applies basic path-traversal
// guards, and streams the file back with the right content-type.

import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAvatar, VIEWS, type AvatarView } from "@/lib/avatars";

// The upload route writes to <process.cwd()>/public/avatars/<id>/<filename>.
// In the deployed container that's /app/public/avatars/<id>/<filename>.
const AVATARS_ROOT = path.resolve(process.cwd(), "public", "avatars");

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const avatar = getAvatar(id);
  if (!avatar) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const url = new URL(req.url);
  const view = url.searchParams.get("view") as AvatarView | "reference" | null;
  if (!view) return NextResponse.json({ error: "Missing ?view=reference|front|left|right|back" }, { status: 400 });

  let filePath: string | null = null;
  if (view === "reference") {
    filePath = avatar.referenceImage ? path.join(AVATARS_ROOT, id, path.basename(avatar.referenceImage)) : null;
  } else if (VIEWS.includes(view as AvatarView)) {
    const v = avatar.views[view as AvatarView];
    filePath = v?.file ? path.join(AVATARS_ROOT, id, path.basename(v.file)) : null;
  } else {
    return NextResponse.json({ error: "Invalid view" }, { status: 400 });
  }

  if (!filePath) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Path-traversal guard: the resolved path must stay inside AVATARS_ROOT.
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(AVATARS_ROOT + path.sep)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const data = await fs.promises.readFile(resolved);
    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || "application/octet-stream";
    return new NextResponse(data, {
      headers: {
        "content-type": contentType,
        "cache-control": "private, max-age=60",
        "content-length": String(data.length)
      }
    });
  } catch {
    return NextResponse.json({ error: "File missing on disk" }, { status: 404 });
  }
}

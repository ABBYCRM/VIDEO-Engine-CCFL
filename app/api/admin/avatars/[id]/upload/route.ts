import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAvatar, updateAvatarReference, updateAvatarView, VIEWS, type AvatarView } from "@/lib/avatars";

const MAX_BYTES = 10 * 1024 * 1024;
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

// POST /api/admin/avatars/[id]/upload
//   multipart/form-data: file=<binary>, kind=reference|view, view=front|left|right|back
//   Saves the image to public/avatars/<id>/<filename>, updates the DB row.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const avatar = getAvatar(id);
  if (!avatar) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  const kind = String(form.get("kind") || "");
  const view = String(form.get("view") || "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: `File must be 1..${MAX_BYTES} bytes` }, { status: 400 });
  }
  if (!["reference", "view"].includes(kind)) {
    return NextResponse.json({ error: "kind must be 'reference' or 'view'" }, { status: 400 });
  }
  if (kind === "view" && !VIEWS.includes(view as AvatarView)) {
    return NextResponse.json({ error: `view must be one of ${VIEWS.join(", ")}` }, { status: 400 });
  }

  // Determine extension from declared mime; fall back to ".bin"
  const mime = file.type || "application/octet-stream";
  const ext =
    mime === "image/jpeg" ? ".jpg" :
    mime === "image/png" ? ".png" :
    mime === "image/webp" ? ".webp" :
    ".bin";

  const targetDir = path.join(PUBLIC_DIR, "avatars", id);
  await fs.mkdir(targetDir, { recursive: true });
  const filename = kind === "reference" ? "identity" + ext : view + ext;
  const fullPath = path.join(targetDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(fullPath, buffer);

  const publicPath = `/avatars/${id}/${filename}`;
  if (kind === "reference") {
    updateAvatarReference(id, publicPath);
  } else {
    updateAvatarView(id, view as AvatarView, publicPath);
  }

  return NextResponse.json({ avatar: getAvatar(id) });
}

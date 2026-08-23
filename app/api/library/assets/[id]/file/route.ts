import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPersistentLibraryAsset } from "@/lib/persistent-library";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const asset = await getPersistentLibraryAsset(id);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  const safe = asset.title.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "generated-media";
  return new NextResponse(asset.bytes, {
    headers: {
      "content-type": asset.mimeType,
      "content-disposition": `inline; filename=\"${safe}\"`,
      "cache-control": "private, max-age=3600"
    }
  });
}

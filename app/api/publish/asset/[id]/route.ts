import { NextResponse } from "next/server";
import { getPersistentLibraryAsset } from "@/lib/persistent-library";
import { verifyPublishedAsset } from "@/lib/publish-media";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const expires = Number(url.searchParams.get("expires") || 0);
  const sig = url.searchParams.get("sig") || "";
  if (!verifyPublishedAsset(id, expires, sig)) return NextResponse.json({ error: "Invalid or expired media link" }, { status: 403 });
  const asset = await getPersistentLibraryAsset(id);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  return new NextResponse(asset.bytes, {
    headers: {
      "content-type": asset.mimeType,
      "cache-control": "public, max-age=300",
      "content-disposition": "inline"
    }
  });
}

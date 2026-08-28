import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import { requireAdmin } from "@/lib/auth";
import { ensureJobOutputPath } from "@/lib/jobs";
import { getPersistentLibraryAsset } from "@/lib/persistent-library";
import { getStockUppersByCategory, saveStockUppersByCategory, saveUploadedVideo } from "@/lib/upper-videos";
import { filesFromForm, saveBulkUploads } from "@/lib/bulk-upload";

export const runtime = "nodejs";
export const maxDuration = 300;

const CATEGORIES = new Set(["car_accident", "rideshare", "trucking", "slip_fall", "ugc"]);

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ stockUppers: getStockUppersByCategory() });
}

/** Bulk-import raw stock-upper video files for one category in a single
 *  request: multipart/form-data with files=<video> (repeatable) + category=<...>.
 *  Complements the JSON items[] mode below, which imports assets that are
 *  already in the Library — this mode is for uploading new raw files. */
async function postMultipart(req: Request) {
  const form = await req.formData();
  const category = String(form.get("category") || "");
  if (!CATEGORIES.has(category)) return NextResponse.json({ error: `category must be one of ${[...CATEGORIES].join(", ")}` }, { status: 400 });
  const files = filesFromForm(form);
  if (!files.length) return NextResponse.json({ error: "Upload one or more video files" }, { status: 400 });
  const replace = form.get("replace") === "1" || form.get("replace") === "true";
  const { ok, failed } = await saveBulkUploads(files, { mediaType: "video", label: `stock-upper · ${category}` });
  const map = replace ? {} : getStockUppersByCategory();
  map[category] = [...(map[category] || []), ...ok.map((x) => x.id)];
  saveStockUppersByCategory(map);
  return NextResponse.json({
    ok: true,
    results: [
      ...ok.map((x) => ({ assetId: x.name, category, ok: true, id: x.id })),
      ...failed.map((x) => ({ assetId: x.name, category, ok: false, error: x.error }))
    ],
    stockUppers: getStockUppersByCategory()
  });
}

/** Import existing Library video assets into the persistent, category-keyed
 *  stock-upper library. Body: { items: [{ assetId, category, title? }], replace? } */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) return postMultipart(req);
  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body?.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: "items[] is required" }, { status: 400 });
  const map = body?.replace ? {} : getStockUppersByCategory();
  const results: Array<{ assetId: string; category: string; ok: boolean; id?: string; error?: string }> = [];
  for (const item of items) {
    const assetId = String(item?.assetId || "");
    const category = String(item?.category || "");
    if (!assetId || !CATEGORIES.has(category)) {
      results.push({ assetId, category, ok: false, error: "assetId and a valid category are required" });
      continue;
    }
    try {
      let bytes: Buffer | null = null;
      let mimeType = "video/mp4";
      if (assetId.startsWith("https://")) {
        // Direct download (e.g. Wikimedia Commons public-domain footage).
        const res = await fetch(assetId, { headers: { "user-agent": "CaseClosedFL-content-engine/1.0" } });
        if (!res.ok) throw new Error(`Source download HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 80 * 1024 * 1024) throw new Error("Source video exceeds the 80MB import limit");
        bytes = buf;
        const ct = String(res.headers.get("content-type") || "");
        mimeType = ct.includes("webm") ? "video/webm" : "video/mp4";
      } else {
        const persisted = await getPersistentLibraryAsset(assetId).catch(() => null);
        if (persisted) {
          bytes = Buffer.from(persisted.bytes);
          mimeType = persisted.mimeType || mimeType;
        } else if (assetId.startsWith("video:")) {
          const outputPath = await ensureJobOutputPath(assetId.slice("video:".length));
          if (outputPath) bytes = await fs.readFile(outputPath);
        }
      }
      if (!bytes?.length) throw new Error("Asset bytes could not be recovered from Library or job output");
      const saved = await saveUploadedVideo({
        bytes,
        title: String(item?.title || `${category} stock upper`),
        mimeType,
        label: `stock-upper · ${category}`
      });
      map[category] = [...(map[category] || []), saved.id];
      results.push({ assetId, category, ok: true, id: saved.id });
    } catch (e) {
      results.push({ assetId, category, ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  }
  saveStockUppersByCategory(map);
  return NextResponse.json({ ok: true, results, stockUppers: getStockUppersByCategory() });
}

/** Remove stock-upper ids. Body: { category?, ids? } — omit both to clear all. */
export async function DELETE(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const category = body?.category ? String(body.category) : null;
  const ids = Array.isArray(body?.ids) ? body.ids.map(String) : null;
  const map = getStockUppersByCategory();
  if (!category && !ids) {
    saveStockUppersByCategory({});
    return NextResponse.json({ ok: true, stockUppers: {} });
  }
  for (const key of Object.keys(map)) {
    if (category && key !== category) continue;
    map[key] = ids ? map[key].filter((id) => !ids.includes(id)) : [];
  }
  saveStockUppersByCategory(map);
  return NextResponse.json({ ok: true, stockUppers: getStockUppersByCategory() });
}

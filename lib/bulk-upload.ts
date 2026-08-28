// Shared multi-file upload helper. Extracted from the working pattern that
// already existed in app/api/campaigns/[id]/upper-videos/route.ts: validate
// each file individually, save sequentially (never Promise.all — that would
// let peak memory scale with the whole batch instead of one file), and never
// let one bad file in a batch fail the rest.

import crypto from "node:crypto";
import { saveUploadedVideo } from "@/lib/upper-videos";
import { savePersistentLibraryAsset } from "@/lib/persistent-library";

export const BULK_UPLOAD_MAX_FILES = 25;
export const BULK_UPLOAD_MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1GB per batch
export const BULK_UPLOAD_MAX_FILE_BYTES = 250 * 1024 * 1024; // 250MB per file

export type BulkUploadOk = { name: string; id: string; url: string; title: string; mimeType: string; bytes: number };
export type BulkUploadFailed = { name: string; error: string };
export type BulkUploadResult = { ok: BulkUploadOk[]; failed: BulkUploadFailed[] };

export type BulkUploadOpts = {
  /** "video" accepts video/* only via saveUploadedVideo (persistent library, kind=stock-upper by default). */
  mediaType: "video" | "image";
  kind?: string;
  label?: string;
  titlePrefix?: string;
};

function extractFiles(form: FormData, pluralField = "files", singularField = "file"): File[] {
  const files = form.getAll(pluralField).filter((v): v is File => v instanceof File);
  const single = form.get(singularField);
  if (single instanceof File) files.push(single);
  return files;
}

/**
 * Save a batch of files, one at a time. Returns a per-file ok/failed list —
 * never throws for an individual file's validation/save error, only for
 * batch-level problems (empty batch, batch too large).
 */
export async function saveBulkUploads(files: File[], opts: BulkUploadOpts): Promise<BulkUploadResult> {
  if (!files.length) throw new Error("Upload one or more files");
  if (files.length > BULK_UPLOAD_MAX_FILES) throw new Error(`A batch is limited to ${BULK_UPLOAD_MAX_FILES} files`);
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  if (totalBytes > BULK_UPLOAD_MAX_TOTAL_BYTES) {
    throw new Error(`Batch total size ${(totalBytes / (1024 * 1024)).toFixed(0)}MB exceeds the ${(BULK_UPLOAD_MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0)}MB batch limit`);
  }

  const ok: BulkUploadOk[] = [];
  const failed: BulkUploadFailed[] = [];

  // Sequential on purpose: bounds peak memory to roughly one file's size,
  // since each file's bytes are buffered in memory via arrayBuffer().
  for (const file of files) {
    try {
      if (opts.mediaType === "video" && !file.type.startsWith("video/")) throw new Error(`${file.name} is not a video`);
      if (opts.mediaType === "image" && !file.type.startsWith("image/")) throw new Error(`${file.name} is not an image`);
      if (file.size < 1) throw new Error(`${file.name} is empty`);
      if (file.size > BULK_UPLOAD_MAX_FILE_BYTES) throw new Error(`${file.name} must be ${(BULK_UPLOAD_MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)}MB or smaller`);

      const bytes = Buffer.from(await file.arrayBuffer());
      const title = `${opts.titlePrefix ? `${opts.titlePrefix} ` : ""}${file.name}`.slice(0, 180);

      if (opts.mediaType === "video") {
        const saved = await saveUploadedVideo({ bytes, title, mimeType: file.type, label: opts.label || "Bulk upload" });
        ok.push({ name: file.name, id: saved.id, url: saved.url, title, mimeType: file.type, bytes: file.size });
      } else {
        const id = `bulk:${crypto.randomUUID()}`;
        const url = await savePersistentLibraryAsset({
          id,
          kind: opts.kind || "bulk-upload",
          mediaType: "image",
          label: opts.label || "Bulk upload",
          title,
          mimeType: file.type,
          bytes
        });
        if (!url) throw new Error("Persistent library is not configured; cannot store bulk uploads");
        ok.push({ name: file.name, id, url, title, mimeType: file.type, bytes: file.size });
      }
    } catch (e) {
      failed.push({ name: file.name, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    }
  }

  return { ok, failed };
}

/** Read `files` (plural, repeatable) + a `file` fallback from a multipart form. */
export function filesFromForm(form: FormData, pluralField = "files", singularField = "file"): File[] {
  return extractFiles(form, pluralField, singularField);
}

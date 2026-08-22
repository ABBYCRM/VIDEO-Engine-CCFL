import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

db.exec(`
CREATE TABLE IF NOT EXISTS generated_images (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  model TEXT,
  prompt TEXT,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'image/png',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_generated_images_created_at ON generated_images(created_at);
`);

export type GeneratedImageRecord = {
  id: string;
  source: string;
  model: string | null;
  prompt: string | null;
  url: string;
  mimeType: string;
  createdAt: string;
};

export async function saveGeneratedImage(input: {
  base64: string;
  source: string;
  model?: string | null;
  prompt?: string | null;
  mimeType?: string;
}) {
  const id = crypto.randomUUID();
  const mimeType = input.mimeType === "image/jpeg" ? "image/jpeg" : input.mimeType === "image/webp" ? "image/webp" : "image/png";
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  const relative = `/generated/images/${id}.${extension}`;
  const absolute = path.resolve(process.cwd(), "public", relative.slice(1));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, Buffer.from(input.base64, "base64"));
  db.prepare("INSERT INTO generated_images(id,source,model,prompt,file_path,mime_type) VALUES(?,?,?,?,?,?)")
    .run(id, input.source, input.model || null, input.prompt?.slice(0, 10000) || null, relative, mimeType);
  return { id, url: relative };
}

export function listGeneratedImages(limit = 200): GeneratedImageRecord[] {
  const rows = db.prepare("SELECT id,source,model,prompt,file_path,mime_type,created_at FROM generated_images ORDER BY created_at DESC LIMIT ?").all(Math.max(1, Math.min(500, limit))) as Array<any>;
  return rows.map(row => ({
    id: row.id,
    source: row.source,
    model: row.model,
    prompt: row.prompt,
    url: row.file_path,
    mimeType: row.mime_type,
    createdAt: row.created_at
  }));
}

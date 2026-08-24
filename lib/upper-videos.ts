import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getAvatar, listAvatars } from "@/lib/avatars";
import { getPersistentLibraryAsset, savePersistentLibraryAsset } from "@/lib/persistent-library";
import { dayIndexFromTitle } from "@/lib/public-copy";

export const DEFAULT_MALE_AVATAR_ID = "male-attorney-01";

function ensureCampaignColumn(name: string, ddl: string) {
  try {
    const cols = db.prepare("PRAGMA table_info(campaigns)").all() as { name: string }[];
    if (!cols.some((c) => c.name === name)) db.exec(`ALTER TABLE campaigns ADD COLUMN ${ddl}`);
  } catch {}
}

export function ensureUpperVideoColumns() {
  ensureCampaignColumn("upper_video_ids", "upper_video_ids TEXT");
}

ensureUpperVideoColumns();

export function parseUpperVideoIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v || "").trim()).filter(Boolean);
  } catch {}
  return raw.split(",").map((v) => v.trim()).filter(Boolean);
}

export function campaignUpperVideoIds(row: any): string[] {
  const fromCampaign = parseUpperVideoIds(row?.upper_video_ids);
  if (fromCampaign.length) return fromCampaign;
  const contentType = String(row?.content_type || row?.contentType || "");
  if (contentType && contentType !== "podcast") return [];
  try {
    const setting = db.prepare("SELECT value FROM settings WHERE key=?").get("default_upper_video_ids") as { value: string } | undefined;
    return parseUpperVideoIds(setting?.value);
  } catch {
    return [];
  }
}

export function pickUpperVideoId(ids: string[], title?: string | null): string | null {
  if (!ids.length) return null;
  return ids[(dayIndexFromTitle(title) - 1) % ids.length] || null;
}

export function saveDefaultUpperVideoIds(ids: string[]) {
  const value = JSON.stringify(ids.filter(Boolean));
  db.prepare(
    "INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP"
  ).run("default_upper_video_ids", value);
}

export function resolveCampaignAvatarId(id?: string | null): string | null {
  if (id && getAvatar(id)) return id;
  if (getAvatar(DEFAULT_MALE_AVATAR_ID)) return DEFAULT_MALE_AVATAR_ID;
  const avatars = listAvatars();
  const male = avatars.find((a) => a.gender === "male" && a.status !== "archived");
  if (male) return male.id;
  const any = avatars.find((a) => a.status !== "archived");
  return any?.id || null;
}

export async function saveUploadedVideo(input: {
  bytes: Buffer;
  title: string;
  mimeType?: string;
  label?: string;
  id?: string;
}): Promise<{ id: string; url: string }> {
  const id = input.id || `upper:${crypto.randomUUID()}`;
  const mime = input.mimeType?.startsWith("video/webm") ? "video/webm" : "video/mp4";
  const persistentUrl = await savePersistentLibraryAsset({
    id,
    kind: "stock-upper",
    mediaType: "video",
    label: input.label || "Campaign upper-lane video",
    title: input.title.slice(0, 180),
    mimeType: mime,
    bytes: input.bytes,
    model: "uploaded",
    prompt: "Operator-supplied split-screen upper lane",
    metadata: { lane: "upper" }
  }).catch(() => null);
  if (persistentUrl) return { id, url: persistentUrl };
  const ext = mime === "video/webm" ? "webm" : "mp4";
  const relative = `/generated/upper/${id.replace(/[^a-zA-Z0-9._-]+/g, "_")}.${ext}`;
  const absolute = path.resolve(process.cwd(), "public", relative.slice(1));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, input.bytes);
  return { id, url: relative };
}

export async function materializeUpperVideo(id: string): Promise<string> {
  const dir = path.resolve(process.env.VIDEO_OUTPUT_DIR || "./data/videos", "upper-sources");
  await fs.mkdir(dir, { recursive: true });
  const safe = id.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  const asset = await getPersistentLibraryAsset(id).catch(() => null);
  if (asset) {
    const ext = asset.mimeType.includes("webm") ? "webm" : "mp4";
    const dest = path.join(dir, `${safe}.${ext}`);
    await fs.writeFile(dest, asset.bytes);
    return dest;
  }
  const candidates = [
    path.resolve(process.cwd(), "public", "generated", "upper", `${safe}.mp4`),
    path.resolve(process.cwd(), "public", "generated", "upper", `${safe}.webm`),
    path.resolve(process.cwd(), "data", "videos", "upper-sources", `${safe}.mp4`)
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error(`Upper-lane video ${id} is not in Library.`);
}

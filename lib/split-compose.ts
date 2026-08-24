import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { savePersistentLibraryAsset } from "@/lib/persistent-library";
import { clampSplitPercent } from "@/lib/split-surface";

db.exec(`CREATE TABLE IF NOT EXISTS generated_compositions(id TEXT PRIMARY KEY,title TEXT NOT NULL,file_path TEXT NOT NULL,mime_type TEXT NOT NULL,upper_source TEXT,lower_source TEXT,split_percent INTEGER NOT NULL DEFAULT 33,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE INDEX IF NOT EXISTS idx_generated_compositions_created_at ON generated_compositions(created_at);`);

export type SavedComposition = { id: string; url: string; mimeType: string; title: string; splitPercent: number };

function evenHeight(splitPercent: number) {
  const raw = Math.round(1280 * clampSplitPercent(splitPercent) / 100);
  const top = Math.max(320, Math.min(576, raw % 2 ? raw + 1 : raw));
  return { top, bottom: 1280 - top };
}

function run(cmd: string, args: string[], timeoutMs = 120_000) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    let done = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    child.stderr.on("data", (chunk) => { err = `${err}${String(chunk)}`.slice(-12_000); });
    child.on("error", (error) => finish(new Error(`${cmd} is not available: ${error.message}`)));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error((err || `${cmd} exited ${code}`).slice(-1800)));
    });
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${cmd} timed out after ${Math.round(timeoutMs / 1000)} seconds`));
    }, timeoutMs);
    timer.unref?.();
  });
}

export async function composeSplitScreenFile(input: {
  upperPath: string;
  lowerPath: string;
  splitPercent: number;
  outputPath: string;
  durationSeconds?: number;
}) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const { top, bottom } = evenHeight(input.splitPercent);
  const duration = 8;
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  const filter = [
    `[0:v]scale=720:${top}:force_original_aspect_ratio=increase,crop=720:${top},fps=30,setsar=1,trim=duration=${duration},setpts=PTS-STARTPTS[ut]`,
    `[1:v]scale=720:${bottom}:force_original_aspect_ratio=increase,crop=720:${bottom},fps=30,setsar=1,trim=duration=${duration},setpts=PTS-STARTPTS[lb]`,
    `[ut][lb]vstack=inputs=2[v]`
  ].join(";");
  const base = [
    "-y",
    "-stream_loop", "-1", "-t", String(duration), "-i", input.upperPath,
    "-stream_loop", "-1", "-t", String(duration), "-i", input.lowerPath,
    "-filter_complex", filter,
    "-map", "[v]",
    "-t", String(duration),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "veryfast",
    "-crf", "23",
    "-movflags", "+faststart"
  ];
  try {
    await run(ffmpeg, [...base, "-map", "1:a?", "-c:a", "aac", "-b:a", "128k", input.outputPath]);
  } catch {
    await run(ffmpeg, [...base, "-an", input.outputPath]);
  }
}

export async function persistComposition(input: {
  bytes: Buffer;
  title: string;
  caption?: string;
  upperSource?: string;
  lowerSource?: string;
  splitPercent: number;
  mimeType?: "video/mp4" | "video/webm";
  model?: string;
}): Promise<SavedComposition> {
  const mime = input.mimeType || "video/mp4";
  const id = crypto.randomUUID();
  const ext = mime === "video/webm" ? "webm" : "mp4";
  const relative = `/generated/compositions/${id}.${ext}`;
  const absolute = path.resolve(process.cwd(), "public", relative.slice(1));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, input.bytes);
  const split = clampSplitPercent(input.splitPercent);
  const title = input.title.slice(0, 180);
  const persistentUrl = await savePersistentLibraryAsset({
    id: `composition:${id}`,
    kind: "composition",
    mediaType: "video",
    label: `Split-screen · ${split}% top`,
    title,
    mimeType: mime,
    bytes: input.bytes,
    model: input.model || "server composition",
    prompt: input.caption || title,
    metadata: { upperSource: input.upperSource || null, lowerSource: input.lowerSource || null, splitPercent: split }
  }).catch(() => null);
  const url = persistentUrl || relative;
  db.prepare("INSERT INTO generated_compositions(id,title,file_path,mime_type,upper_source,lower_source,split_percent) VALUES(?,?,?,?,?,?,?)").run(id, title, url, mime, input.upperSource || null, input.lowerSource || null, split);
  return { id, url, mimeType: mime, title, splitPercent: split };
}

export async function composeSplitSources(input: {
  upperPath: string;
  lowerPath: string;
  splitPercent: number;
  title: string;
  caption?: string;
  upperSource?: string;
  lowerSource?: string;
}) {
  const tmpPath = path.resolve(process.env.VIDEO_OUTPUT_DIR || "./data/videos", `split-${crypto.randomUUID()}.mp4`);
  await composeSplitScreenFile({
    upperPath: input.upperPath,
    lowerPath: input.lowerPath,
    splitPercent: input.splitPercent,
    outputPath: tmpPath
  });
  const bytes = await fs.readFile(tmpPath);
  await fs.unlink(tmpPath).catch(() => {});
  return persistComposition({
    bytes,
    title: input.title,
    caption: input.caption,
    upperSource: input.upperSource,
    lowerSource: input.lowerSource,
    splitPercent: input.splitPercent,
    mimeType: "video/mp4",
    model: "ffmpeg split-screen"
  });
}

export async function composeSplitJobs(input: {
  upperPath: string;
  lowerPath: string;
  splitPercent: number;
  title: string;
  caption?: string;
  upperJobId: string;
  lowerJobId: string;
}) {
  return composeSplitSources({
    upperPath: input.upperPath,
    lowerPath: input.lowerPath,
    splitPercent: input.splitPercent,
    title: input.title,
    caption: input.caption,
    upperSource: input.upperJobId,
    lowerSource: input.lowerJobId
  });
}


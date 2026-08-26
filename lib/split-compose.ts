import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { savePersistentLibraryAsset } from "@/lib/persistent-library";
import { clampSplitDuration, clampSplitPercent } from "@/lib/split-surface";
import { type SplitTemplateId } from "@/lib/split-templates";
import { resolveSplitTemplate, getCustomSplitTemplate } from "@/lib/custom-split-templates";
import { CASE_CLOSED_PHONE, CASE_CLOSED_URL } from "@/lib/brand-contact";

db.exec(`CREATE TABLE IF NOT EXISTS generated_compositions(id TEXT PRIMARY KEY,title TEXT NOT NULL,file_path TEXT NOT NULL,mime_type TEXT NOT NULL,upper_source TEXT,lower_source TEXT,split_percent INTEGER NOT NULL DEFAULT 33,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);CREATE INDEX IF NOT EXISTS idx_generated_compositions_created_at ON generated_compositions(created_at);`);

export type SavedComposition = { id: string; url: string; mimeType: string; title: string; splitPercent: number };

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
  templateId?: SplitTemplateId | string | null;
  outputPath: string;
  durationSeconds?: number;
}) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const duration = clampSplitDuration(input.durationSeconds);
  const template = resolveSplitTemplate(input.templateId);
  const custom = getCustomSplitTemplate(template.id);
  const templatePath = custom ? path.resolve(custom.filePath) : path.resolve(process.cwd(), "public", template.assetPath.replace(/^\//, ""));
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  // cover-crop a lane's video to exactly fill a box without stretching it.
  // Horizontally centered (a left-anchored crop showed off-center stock footage);
  // vertically top-anchored so a portrait subject's head is never cut.
  const coverCrop = (streamIn: string, box: { w: number; h: number }, streamOut: string) =>
    `[${streamIn}]scale=${box.w}:${box.h}:force_original_aspect_ratio=increase,crop=${box.w}:${box.h}:(in_w-out_w)/2:0,fps=30,setsar=1,trim=duration=${duration},setpts=PTS-STARTPTS[${streamOut}]`;
  let filter: string;
  const bannerH = Math.round(template.canvasH * 0.075);
  const bannerY = Math.round(template.canvasH * 0.03);
  const fontSize = Math.max(18, Math.round(template.canvasW * 0.035));
  // Prefer the font bundled with the app (survives any base image); fall
  // back to common system locations (Alpine, then Debian layout).
  const fontCandidates = [
    process.env.FONT_PATH,
    path.resolve(process.cwd(), "public", "fonts", "DejaVuSans-Bold.ttf"),
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
  ].filter((p): p is string => Boolean(p));
  let fontPath = fontCandidates[1];
  for (const candidate of fontCandidates) {
    try { await fs.access(candidate); fontPath = candidate; break; } catch {}
  }
  const banner = `drawbox=x=0:y=${bannerY}:w=iw:h=${bannerH}:color=black@0.68:t=fill,drawtext=fontfile='${fontPath}':text='${CASE_CLOSED_URL}  ·  ${CASE_CLOSED_PHONE}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=${bannerY}+((${bannerH}-text_h)/2)[v]`;
  if (template.layout === "avatar-box") {
    // The upper AI video cover-crops the whole canvas as the permanent
    // background layer. The avatar's own video (with its own generated
    // background) cover-crops separately into the template's avatar box.
    // The selected branded template — permanent office backdrop + gold
    // frame, opaque everywhere except the avatar box and the area above
    // the backdrop — goes on top of both.
    const box = template.avatarBox;
    filter = [
      coverCrop("0:v", { w: template.canvasW, h: template.canvasH }, "bg"),
      coverCrop("1:v", box, "av"),
      `[bg][av]overlay=x=${box.x}:y=${box.y}[stacked]`,
      `[stacked][2:v]overlay=x=0:y=0:format=auto[composed]`,
      `[composed]${banner}`
    ].join(";");
  } else {
    // Dual-box: the upper and lower lanes each cover-crop into their own
    // framed box over the static template artwork (no lane fills the
    // whole canvas).
    const { upperBox, lowerBox } = template;
    filter = [
      coverCrop("0:v", upperBox, "uv"),
      coverCrop("1:v", lowerBox, "lv"),
      `[2:v][uv]overlay=x=${upperBox.x}:y=${upperBox.y}[stacked]`,
      `[stacked][lv]overlay=x=${lowerBox.x}:y=${lowerBox.y}:format=auto[composed]`,
      `[composed]${banner}`
    ].join(";");
  }
  const base = [
    "-y",
    "-stream_loop", "-1", "-t", String(duration), "-i", input.upperPath,
    "-stream_loop", "-1", "-t", String(duration), "-i", input.lowerPath,
    "-loop", "1", "-i", templatePath,
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
  templateId?: SplitTemplateId | string | null;
  durationSeconds?: number;
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
    templateId: input.templateId,
    durationSeconds: input.durationSeconds,
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
  templateId?: SplitTemplateId | string | null;
  durationSeconds?: number;
  title: string;
  caption?: string;
  upperJobId: string;
  lowerJobId: string;
}) {
  return composeSplitSources({
    upperPath: input.upperPath,
    lowerPath: input.lowerPath,
    splitPercent: input.splitPercent,
    templateId: input.templateId,
    durationSeconds: input.durationSeconds,
    title: input.title,
    caption: input.caption,
    upperSource: input.upperJobId,
    lowerSource: input.lowerJobId
  });
}


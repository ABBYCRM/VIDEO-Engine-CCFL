/** List entry names from a ZIP central directory. No extra dependency. */
export function zipEntryNames(buf: Buffer, max = 80): string[] {
  if (buf.length < 22) return [];
  let eocd = -1;
  const start = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const cdOff = buf.readUInt32LE(eocd + 16);
  const cdSize = buf.readUInt32LE(eocd + 12);
  if (cdOff < 0 || cdOff >= buf.length) return [];
  const names: string[] = [];
  let p = cdOff;
  const end = Math.min(buf.length, cdOff + cdSize);
  while (p + 46 <= end && names.length < max) {
    if (buf[p] !== 0x50 || buf[p + 1] !== 0x4b || buf[p + 2] !== 0x01 || buf[p + 3] !== 0x02) break;
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");
    if (name) names.push(name);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return names;
}

export function mimeFromFilename(name: string, reported?: string): string {
  const given = (reported || "").trim();
  if (given && given !== "application/octet-stream") return given.slice(0, 120);
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    zip: "application/zip",
    gz: "application/gzip",
    tgz: "application/gzip",
    tar: "application/x-tar",
    pdf: "application/pdf",
    json: "application/json",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    html: "text/html",
    css: "text/css",
    js: "text/javascript",
    ts: "text/plain",
    tsx: "text/plain",
    py: "text/x-python",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || "application/octet-stream";
}

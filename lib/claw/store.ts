import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

db.exec(`
CREATE TABLE IF NOT EXISTS claw_conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New thread',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS claw_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','assistant','tool','system')),
  content TEXT NOT NULL DEFAULT '',
  tool_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES claw_conversations(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS claw_files (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_claw_messages_conv ON claw_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_claw_files_conv ON claw_files(conversation_id, created_at);
`);

const FILES_DIR = path.resolve(process.cwd(), "data/claw-files");
fs.mkdirSync(FILES_DIR, { recursive: true });

export type ClawRole = "user" | "assistant" | "tool" | "system";
export type ClawConversation = { id: string; title: string; createdAt: string; updatedAt: string };
export type ClawMessage = { id: string; conversationId: string; role: ClawRole; content: string; toolJson: unknown; createdAt: string };
export type ClawFile = { id: string; conversationId: string | null; name: string; mime: string; size: number; path: string; createdAt: string; url: string };

function rowConv(r: any): ClawConversation {
  return { id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at };
}
function rowMsg(r: any): ClawMessage {
  let toolJson: unknown = null;
  if (r.tool_json) { try { toolJson = JSON.parse(r.tool_json); } catch { toolJson = r.tool_json; } }
  return { id: r.id, conversationId: r.conversation_id, role: r.role, content: r.content, toolJson, createdAt: r.created_at };
}
function rowFile(r: any): ClawFile {
  return { id: r.id, conversationId: r.conversation_id, name: r.name, mime: r.mime, size: r.size, path: r.path, createdAt: r.created_at, url: `/api/claw/files/${r.id}/file` };
}

export function listConversations(): ClawConversation[] {
  return (db.prepare("SELECT * FROM claw_conversations ORDER BY updated_at DESC LIMIT 80").all() as any[]).map(rowConv);
}

export function getConversation(id: string): ClawConversation | null {
  const r = db.prepare("SELECT * FROM claw_conversations WHERE id=?").get(id) as any;
  return r ? rowConv(r) : null;
}

export function createConversation(title = "New thread"): ClawConversation {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO claw_conversations(id,title) VALUES(?,?)").run(id, title.slice(0, 80) || "New thread");
  return getConversation(id)!;
}

export function renameConversation(id: string, title: string) {
  db.prepare("UPDATE claw_conversations SET title=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(title.slice(0, 80) || "New thread", id);
  return getConversation(id);
}

export function touchConversation(id: string) {
  db.prepare("UPDATE claw_conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
}

export function deleteConversation(id: string) {
  const files = listFiles(id);
  db.prepare("DELETE FROM claw_messages WHERE conversation_id=?").run(id);
  db.prepare("DELETE FROM claw_files WHERE conversation_id=?").run(id);
  db.prepare("DELETE FROM claw_conversations WHERE id=?").run(id);
  for (const f of files) {
    fsp.unlink(f.path).catch(() => {});
  }
}

export function listMessages(conversationId: string, limit = 80): ClawMessage[] {
  const bounded = Math.max(1, Math.min(200, Math.trunc(limit)));
  return (db.prepare(`
    SELECT * FROM (
      SELECT rowid AS _rowid, * FROM claw_messages
      WHERE conversation_id=?
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?
    )
    ORDER BY created_at ASC, _rowid ASC
  `).all(conversationId, bounded) as any[]).map(rowMsg);
}

export function addMessage(input: { conversationId: string; role: ClawRole; content: string; toolJson?: unknown }): ClawMessage {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO claw_messages(id,conversation_id,role,content,tool_json) VALUES(?,?,?,?,?)").run(
    id, input.conversationId, input.role, input.content, input.toolJson ? JSON.stringify(input.toolJson) : null
  );
  touchConversation(input.conversationId);
  const r = db.prepare("SELECT * FROM claw_messages WHERE id=?").get(id) as any;
  return rowMsg(r);
}

export function deleteMessage(id: string, conversationId?: string) {
  const row = conversationId
    ? db.prepare("SELECT conversation_id FROM claw_messages WHERE id=? AND conversation_id=?").get(id, conversationId) as { conversation_id: string } | undefined
    : db.prepare("SELECT conversation_id FROM claw_messages WHERE id=?").get(id) as { conversation_id: string } | undefined;
  if (!row) return false;
  db.prepare("DELETE FROM claw_messages WHERE id=? AND conversation_id=?").run(id, row.conversation_id);
  if (row) touchConversation(row.conversation_id);
  return Boolean(row);
}

export function listFiles(conversationId?: string | null): ClawFile[] {
  if (conversationId) {
    return (db.prepare("SELECT * FROM claw_files WHERE conversation_id=? OR conversation_id IS NULL ORDER BY created_at DESC LIMIT 80").all(conversationId) as any[]).map(rowFile);
  }
  return (db.prepare("SELECT * FROM claw_files ORDER BY created_at DESC LIMIT 80").all() as any[]).map(rowFile);
}

export function getFile(id: string): ClawFile | null {
  const r = db.prepare("SELECT * FROM claw_files WHERE id=?").get(id) as any;
  return r ? rowFile(r) : null;
}

export async function saveClawFile(input: { conversationId?: string | null; name: string; mime: string; bytes: Buffer }): Promise<ClawFile> {
  const id = crypto.randomUUID();
  const safe = input.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "file";
  const disk = path.join(FILES_DIR, `${id}-${safe}`);
  await fsp.writeFile(disk, input.bytes);
  db.prepare("INSERT INTO claw_files(id,conversation_id,name,mime,size,path) VALUES(?,?,?,?,?,?)").run(
    id, input.conversationId || null, input.name.slice(0, 180), input.mime.slice(0, 120), input.bytes.length, disk
  );
  return getFile(id)!;
}

export async function deleteClawFile(id: string) {
  const f = getFile(id);
  if (!f) return false;
  db.prepare("DELETE FROM claw_files WHERE id=?").run(id);
  await fsp.unlink(f.path).catch(() => {});
  return true;
}

export function renameClawFile(id: string, name: string) {
  db.prepare("UPDATE claw_files SET name=? WHERE id=?").run(name.slice(0, 180), id);
  return getFile(id);
}

export async function readClawFileText(id: string, max = 8000): Promise<string | null> {
  const f = getFile(id);
  if (!f) return null;
  if (!/^text\/|^application\/(json|xml|javascript|csv)/.test(f.mime) && !/\.(txt|md|csv|json|xml|js|ts|py)$/i.test(f.name)) {
    return `[binary file ${f.name} · ${f.mime} · ${f.size} bytes]`;
  }
  const buf = await fsp.readFile(f.path);
  const text = buf.toString("utf8");
  return text.length > max ? text.slice(0, max) + `\n… (${text.length - max} more chars)` : text;
}

export async function readClawFileBase64(id: string): Promise<{ mime: string; base64: string; name: string } | null> {
  const f = getFile(id);
  if (!f) return null;
  const buf = await fsp.readFile(f.path);
  return { mime: f.mime, base64: buf.toString("base64"), name: f.name };
}

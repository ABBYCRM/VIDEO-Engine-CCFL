// Coding Agent adapter — an HTTP client to an EXTERNAL, operator-provisioned
// sandbox service. This deliberately does NOT execute code in-process.
//
// Why: this app's own process is the production Next.js server holding
// every secret this app has (APP_ENCRYPTION_KEY, ADMIN_PASSWORD,
// SESSION_SECRET, every provider key — see README "Security model" and
// AGENTS.md). Adding arbitrary code execution inside that same container
// would be a severe security regression against this repo's own documented
// posture. A Coding Agent therefore requires a separate, network-isolated
// sandbox (a container/micro-VM with NO access to this app's secrets or
// database) that the operator stands up and configures here — the same
// shape as every other external-provider adapter in this app (Hedra, Veo,
// Steel, Composio): a real HTTP client against a real external service the
// operator configures, not a stub.
//
// If CODING_SANDBOX_URL is not configured, every call below fails clearly
// rather than silently no-op'ing or executing anything locally.

import crypto from "node:crypto";
import net from "node:net";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scrubSecrets } from "@/lib/coding-agent/secret-scrub";

db.exec(`
CREATE TABLE IF NOT EXISTS coding_sessions (
  id TEXT PRIMARY KEY,
  purpose TEXT,
  workspace_ref TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS coding_commands (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  command TEXT NOT NULL,
  exit_code INTEGER,
  output_excerpt TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_coding_commands_session ON coding_commands(session_id);
`);

const URL_KEY = "coding_sandbox_url";
const TOKEN_KEY = "coding_sandbox_token_encrypted";
const MAX_OUTPUT_CHARS = 8000;
const COMMAND_TIMEOUT_MS = 30_000;

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}
function setRaw(key: string, value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(key, value);
}

export function isCodingSandboxConfigured(): boolean {
  return Boolean(getRaw(URL_KEY) || process.env.CODING_SANDBOX_URL);
}

export function getCodingSandboxUrl(): string {
  const url = getRaw(URL_KEY) || process.env.CODING_SANDBOX_URL;
  if (!url) throw new Error("No coding sandbox is configured. This requires a separate, network-isolated sandbox service the operator provisions — set CODING_SANDBOX_URL (and CODING_SANDBOX_TOKEN) once one exists.");
  return url;
}

function getCodingSandboxToken(): string | null {
  const encrypted = getRaw(TOKEN_KEY);
  if (encrypted) return decryptSecret(encrypted);
  return process.env.CODING_SANDBOX_TOKEN || null;
}

export function saveCodingSandboxConfig(input: { url?: string; token?: string }) {
  if (input.url) setRaw(URL_KEY, input.url.trim());
  if (input.token) setRaw(TOKEN_KEY, encryptSecret(input.token.trim()));
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return true;
  if (net.isIP(host) === 4) {
    const parts = host.split(".").map(Number);
    return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
  }
  return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
}

export function createCodingSession(purpose?: string): { id: string; workspaceRef: string } {
  const id = crypto.randomUUID();
  const workspaceRef = `ws-${id.slice(0, 8)}`;
  db.prepare("INSERT INTO coding_sessions(id,purpose,workspace_ref) VALUES(?,?,?)").run(id, purpose || null, workspaceRef);
  return { id, workspaceRef };
}

async function sandboxRequest(path: string, body: Record<string, unknown>): Promise<any> {
  const base = getCodingSandboxUrl();
  const url = new URL(path, base);
  if (isPrivateOrLocalHost(url.hostname)) throw new Error(`Refusing to call a private/local sandbox host (${url.hostname}) — the sandbox must be a separate network-reachable service, not this app's own container.`);
  const token = getCodingSandboxToken();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), COMMAND_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: ac.signal,
      cache: "no-store"
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Sandbox HTTP ${res.status}: ${scrubSecrets(text).slice(0, 500)}`);
    try { return JSON.parse(text); } catch { return { raw: text }; }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`Sandbox request timed out after ${COMMAND_TIMEOUT_MS / 1000}s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function logCommand(sessionId: string, command: string, exitCode: number | null, outputExcerpt: string) {
  // Scrub the command text too, not just its output: a command that embeds
  // a secret directly (e.g. a curl with an Authorization header) must not
  // leave that secret sitting at rest in coding_commands, since
  // listCodingCommands() returns this table verbatim.
  db.prepare("INSERT INTO coding_commands(id,session_id,command,exit_code,output_excerpt) VALUES(?,?,?,?,?)").run(
    crypto.randomUUID(), sessionId, scrubSecrets(command).slice(0, 2000), exitCode, scrubSecrets(outputExcerpt).slice(0, MAX_OUTPUT_CHARS)
  );
}

export async function runCommand(input: { sessionId: string; workspaceRef: string; command: string }): Promise<{ exitCode: number | null; output: string }> {
  const result = await sandboxRequest("/run", { workspaceRef: input.workspaceRef, command: input.command });
  const output = scrubSecrets(String(result?.output ?? result?.raw ?? "")).slice(0, MAX_OUTPUT_CHARS);
  const exitCode = Number.isFinite(result?.exitCode) ? Number(result.exitCode) : null;
  logCommand(input.sessionId, input.command, exitCode, output);
  return { exitCode, output };
}

export async function readFile(input: { workspaceRef: string; path: string }): Promise<string> {
  const result = await sandboxRequest("/read-file", { workspaceRef: input.workspaceRef, path: input.path });
  return scrubSecrets(String(result?.content ?? "")).slice(0, MAX_OUTPUT_CHARS);
}

export async function writeFile(input: { workspaceRef: string; path: string; content: string }): Promise<{ ok: boolean }> {
  const result = await sandboxRequest("/write-file", { workspaceRef: input.workspaceRef, path: input.path, content: input.content });
  return { ok: Boolean(result?.ok ?? true) };
}

export async function listFiles(input: { workspaceRef: string; path?: string }): Promise<string[]> {
  const result = await sandboxRequest("/list-files", { workspaceRef: input.workspaceRef, path: input.path || "." });
  return Array.isArray(result?.files) ? result.files.map((f: unknown) => String(f)) : [];
}

export function listCodingCommands(sessionId: string) {
  return db.prepare("SELECT id,command,exit_code,output_excerpt,created_at FROM coding_commands WHERE session_id=? ORDER BY created_at ASC").all(sessionId);
}

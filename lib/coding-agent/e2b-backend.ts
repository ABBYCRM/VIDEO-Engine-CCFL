// E2B (e2b.dev) backend for the Coding Agent — a managed, hosted
// alternative to the operator's own CODING_SANDBOX_URL server
// (coding-sandbox-server/). Selected via the "coding_sandbox_provider"
// setting in lib/coding-agent/client.ts; that file is still the single
// entry point every Claw tool calls, so nothing else needs to know which
// backend is active.
//
// Every fact below (import shape, method names, return shapes, exit-code
// behavior, reconnect semantics) was verified against the real e2b npm
// package (v2.46.1) with a real sandbox and a real API key during this
// integration — not copied from documentation alone, several of which
// disagreed with the actual installed SDK:
//   - `import Sandbox from "e2b"` (default export) does NOT work; the
//     class is a named export: `import { Sandbox } from "e2b"`.
//   - sandbox.commands.run() returns {exitCode:0,stdout,stderr} on
//     success, but THROWS CommandExitError on a non-zero exit — the
//     result is on e.result, not the return value.
//   - sandbox.files.read() resolves directly to the file's string
//     content (not a wrapped object).
//   - sandbox.files.list() resolves to
//     [{name,type,path,size,mode,permissions,owner,group,modifiedTime}].
//   - Sandbox.connect(sandboxId) reconnects to the same running sandbox
//     with prior filesystem state intact (confirmed: a file written
//     before reconnecting was still readable after). This is what makes
//     E2B usable at all here, since every runCommand/readFile/writeFile
//     call is a separate function call, not one held-open connection.
//   - sandbox.setTimeout(ms) extends the sandbox's idle-kill timer; each
//     call below extends it so a session doesn't expire between an
//     agent's commands.

import { Sandbox, CommandExitError } from "e2b";
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const KEY_SETTING = "e2b_api_key";
// Keep the sandbox alive for 10 minutes past each call; a long-idle Claw
// coding session would otherwise find its sandbox already killed.
const KEEPALIVE_MS = 10 * 60 * 1000;

function getRaw(key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

export function isE2bConfigured(): boolean {
  return Boolean(getRaw(KEY_SETTING) || process.env.E2B_API_KEY?.trim());
}

export function getE2bApiKey(): string {
  const encrypted = getRaw(KEY_SETTING);
  if (encrypted) return decryptSecret(encrypted);
  const key = process.env.E2B_API_KEY?.trim();
  if (!key) throw new Error("E2B is not configured. Save an E2B API key in Settings, or set E2B_API_KEY on the server.");
  return key;
}

export function saveE2bApiKey(value: string) {
  db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").run(KEY_SETTING, encryptSecret(value.trim()));
}

async function connect(workspaceRef: string) {
  const sandbox = await Sandbox.connect(workspaceRef, { apiKey: getE2bApiKey() });
  await sandbox.setTimeout(KEEPALIVE_MS);
  return sandbox;
}

export async function e2bCreateSession(): Promise<string> {
  const sandbox = await Sandbox.create({ apiKey: getE2bApiKey(), timeoutMs: KEEPALIVE_MS });
  return sandbox.sandboxId;
}

export async function e2bRunCommand(workspaceRef: string, command: string): Promise<{ exitCode: number | null; output: string }> {
  const sandbox = await connect(workspaceRef);
  try {
    const result = await sandbox.commands.run(command);
    return { exitCode: result.exitCode, output: `${result.stdout || ""}${result.stderr ? `\n${result.stderr}` : ""}` };
  } catch (e) {
    if (e instanceof CommandExitError) {
      // .result is typed private in the SDK's declarations but is a real,
      // populated property at runtime (confirmed against a live sandbox) —
      // it's the only place the actual stdout/stderr/exitCode of a failed
      // command survive; e.message is just "exit status N".
      const r = (e as unknown as { result: { exitCode: number; stdout?: string; stderr?: string; error?: string } }).result;
      return { exitCode: r.exitCode, output: `${r.stdout || ""}${r.stderr ? `\n${r.stderr}` : ""}${r.error ? `\n${r.error}` : ""}` };
    }
    throw e;
  }
}

export async function e2bReadFile(workspaceRef: string, path: string): Promise<string> {
  const sandbox = await connect(workspaceRef);
  const content = await sandbox.files.read(path);
  return String(content ?? "");
}

export async function e2bWriteFile(workspaceRef: string, path: string, content: string): Promise<{ ok: boolean }> {
  const sandbox = await connect(workspaceRef);
  await sandbox.files.write(path, content);
  return { ok: true };
}

export async function e2bListFiles(workspaceRef: string, path = "."): Promise<string[]> {
  const sandbox = await connect(workspaceRef);
  const entries = await sandbox.files.list(path);
  return entries.map((e) => e.name);
}

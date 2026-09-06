// Optional E2B sandbox for Claw. Never executes in this process.
import { Sandbox } from "e2b";

const MAX_CODE = 20_000;
const TIMEOUT_MS = 60_000;

export function isE2BConfigured(): boolean {
  return Boolean(process.env.E2B_API_KEY?.trim());
}

function apiKey() {
  const key = process.env.E2B_API_KEY?.trim();
  if (!key) throw new Error("E2B is not configured. Set E2B_API_KEY on the server.");
  return key;
}

export async function runE2BCommand(input: { command?: unknown; cwd?: unknown }) {
  const command = String(input.command || "").trim();
  if (!command) throw new Error("command is required");
  if (command.length > MAX_CODE) throw new Error("command exceeds 20,000 characters");
  const sandbox = await Sandbox.create({ apiKey: apiKey(), timeoutMs: TIMEOUT_MS });
  try {
    const result = await sandbox.commands.run(command, {
      cwd: typeof input.cwd === "string" && input.cwd.trim() ? input.cwd.trim() : undefined,
      timeoutMs: TIMEOUT_MS
    });
    return {
      via: "e2b",
      exitCode: result.exitCode,
      stdout: String(result.stdout || "").slice(0, 8_000),
      stderr: String(result.stderr || "").slice(0, 4_000)
    };
  } finally {
    await sandbox.kill().catch(() => {});
  }
}

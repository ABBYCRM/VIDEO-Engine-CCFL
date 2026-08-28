// Coding Agent sandbox server.
//
// Implements the exact 4-endpoint contract that VIDEO-Engine's
// lib/coding-agent/client.ts already calls:
//   POST /run         { workspaceRef, command } -> { exitCode, output }
//   POST /read-file    { workspaceRef, path }    -> { content }
//   POST /write-file   { workspaceRef, path, content } -> { ok: true }
//   POST /list-files   { workspaceRef, path? }   -> { files: [...] }
//
// Every command runs inside its own throwaway Docker container, not on this
// host process directly. Per-workspace state persists across calls via a
// named Docker volume, so "npm install" then "npm test" in the same
// workspaceRef sees the same files.
//
// This process itself holds ZERO video-engine secrets. Its only secret is
// its own bearer token (SANDBOX_TOKEN), used to authenticate the one caller
// (VIDEO-Engine's server) that's allowed to send it commands.

const express = require("express");
const Docker = require("dockerode");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 8080);
const SANDBOX_TOKEN = process.env.SANDBOX_TOKEN || "";
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || "node:20-alpine";
const ALLOW_NETWORK = process.env.SANDBOX_ALLOW_NETWORK === "true";
const MEMORY_MB = Number(process.env.SANDBOX_MEMORY_MB || 512);
const CPU_LIMIT = Number(process.env.SANDBOX_CPUS || 1);
const COMMAND_TIMEOUT_MS = Number(process.env.SANDBOX_COMMAND_TIMEOUT_MS || 60_000);
const MAX_OUTPUT_CHARS = 20_000;

if (!SANDBOX_TOKEN) {
  console.error("FATAL: SANDBOX_TOKEN is not set. Refusing to start unauthenticated.");
  process.exit(1);
}

const docker = new Docker(); // talks to /var/run/docker.sock by default

function volumeNameFor(workspaceRef) {
  const clean = String(workspaceRef || "").replace(/[^a-zA-Z0-9_.-]/g, "");
  if (!clean) throw new Error("workspaceRef is required");
  return `sandbox-ws-${clean}`;
}

async function ensureVolume(name) {
  try {
    await docker.getVolume(name).inspect();
  } catch {
    await docker.createVolume({ Name: name });
  }
}

/** Run one shell command inside a fresh, throwaway container bound to the
 *  workspace's persistent volume. Kills the container if it runs past the
 *  configured timeout. Network is off by default — turn it on only if you
 *  need package installs, understanding that's an operator risk decision. */
async function runInContainer({ workspaceRef, command }) {
  const volumeName = volumeNameFor(workspaceRef);
  await ensureVolume(volumeName);

  const container = await docker.createContainer({
    Image: SANDBOX_IMAGE,
    Cmd: ["sh", "-c", command],
    WorkingDir: "/workspace",
    HostConfig: {
      Binds: [`${volumeName}:/workspace`],
      NetworkMode: ALLOW_NETWORK ? "bridge" : "none",
      Memory: MEMORY_MB * 1024 * 1024,
      NanoCpus: Math.round(CPU_LIMIT * 1e9),
      AutoRemove: false, // we remove explicitly after reading logs
      ReadonlyRootfs: false // /workspace volume is writable; rest of rootfs still ephemeral per-container
    },
    Tty: false
  });

  let timedOut = false;
  const timer = setTimeout(async () => {
    timedOut = true;
    try { await container.kill(); } catch { /* already stopped */ }
  }, COMMAND_TIMEOUT_MS);

  try {
    await container.start();
    const stream = await container.attach({ stream: true, stdout: true, stderr: true });
    let output = "";
    await new Promise((resolve) => {
      docker.modem.demuxStream(
        stream,
        { write: (chunk) => { output += chunk.toString("utf8"); } },
        { write: (chunk) => { output += chunk.toString("utf8"); } }
      );
      stream.on("end", resolve);
    });
    const inspect = await container.wait();
    clearTimeout(timer);
    return {
      exitCode: timedOut ? null : Number(inspect.StatusCode),
      output: timedOut ? `${output}\n[killed: exceeded ${COMMAND_TIMEOUT_MS}ms timeout]` : output.slice(0, MAX_OUTPUT_CHARS)
    };
  } finally {
    clearTimeout(timer);
    try { await container.remove({ force: true }); } catch { /* best effort */ }
  }
}

/** File read/write/list are implemented as tiny one-shot commands against
 *  the same workspace volume, so they see exactly what /run left behind. */
async function readFileFromWorkspace({ workspaceRef, path }) {
  const safePath = String(path || "").replace(/'/g, "'\\''");
  const result = await runInContainer({ workspaceRef, command: `cat -- '${safePath}'` });
  if (result.exitCode !== 0) throw new Error(`read-file failed (exit ${result.exitCode}): ${result.output}`);
  return result.output;
}

async function writeFileToWorkspace({ workspaceRef, path, content }) {
  const safePath = String(path || "").replace(/'/g, "'\\''");
  const dir = safePath.includes("/") ? safePath.slice(0, safePath.lastIndexOf("/")) : "";
  const encoded = Buffer.from(String(content ?? ""), "utf8").toString("base64");
  const mkdirCmd = dir ? `mkdir -p -- '${dir.replace(/'/g, "'\\''")}' && ` : "";
  const result = await runInContainer({ workspaceRef, command: `${mkdirCmd}echo '${encoded}' | base64 -d > '${safePath}'` });
  if (result.exitCode !== 0) throw new Error(`write-file failed (exit ${result.exitCode}): ${result.output}`);
  return { ok: true };
}

async function listFilesInWorkspace({ workspaceRef, path }) {
  const safePath = String(path || ".").replace(/'/g, "'\\''");
  const result = await runInContainer({ workspaceRef, command: `find '${safePath}' -maxdepth 3 2>/dev/null | sed 's|^\\./||'` });
  if (result.exitCode !== 0) throw new Error(`list-files failed (exit ${result.exitCode}): ${result.output}`);
  return result.output.split("\n").map((l) => l.trim()).filter(Boolean);
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  const auth = req.headers.authorization || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const expected = Buffer.from(SANDBOX_TOKEN);
  const given = Buffer.from(provided);
  const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!ok) return res.status(401).json({ error: "unauthorized" });
  next();
});

app.post("/run", async (req, res) => {
  try {
    const { workspaceRef, command } = req.body || {};
    if (!workspaceRef || !command) return res.status(400).json({ error: "workspaceRef and command are required" });
    const result = await runInContainer({ workspaceRef, command });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/read-file", async (req, res) => {
  try {
    const { workspaceRef, path } = req.body || {};
    if (!workspaceRef || !path) return res.status(400).json({ error: "workspaceRef and path are required" });
    const content = await readFileFromWorkspace({ workspaceRef, path });
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/write-file", async (req, res) => {
  try {
    const { workspaceRef, path, content } = req.body || {};
    if (!workspaceRef || !path) return res.status(400).json({ error: "workspaceRef and path are required" });
    const result = await writeFileToWorkspace({ workspaceRef, path, content });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/list-files", async (req, res) => {
  try {
    const { workspaceRef, path } = req.body || {};
    if (!workspaceRef) return res.status(400).json({ error: "workspaceRef is required" });
    const files = await listFilesInWorkspace({ workspaceRef, path });
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, image: SANDBOX_IMAGE, network: ALLOW_NETWORK ? "bridge" : "none" }));

app.listen(PORT, () => {
  console.log(`Coding sandbox server listening on :${PORT} (image=${SANDBOX_IMAGE}, network=${ALLOW_NETWORK ? "bridge" : "none (isolated)"})`);
});

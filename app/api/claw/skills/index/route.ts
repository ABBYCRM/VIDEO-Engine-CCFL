// /api/claw/skills/index — (re)build the pgvector dev-skills index.
//
// The dev-skills RAG stage-1 (lib/claw/vector-store.ts) only returns hits
// once the corpus has been embedded into the DO Managed Postgres pgvector
// table. This route drives that:
//
//   GET  → status: is a vector DB configured, is NVIDIA configured for
//          embeddings, and how many vectors are currently stored.
//   POST → ensure the schema + (re)embed the corpus. Body { "force": true }
//          re-embeds every skill even if unchanged; default only embeds
//          new/changed skills (by content hash). Returns the index report.
//
// Also wired as the PRE_DEPLOY entry point on DigitalOcean via the
// migrate job + a one-shot curl in .do/app.yaml notes; safe to call any
// time (idempotent). requireAdmin() gates it like every other Claw route
// (this deployment is network-access-controlled).

import { requireAdmin } from "@/lib/auth";
import { isEmbedConfigured } from "@/lib/nvidia/embed";
import {
  isVectorStoreConfigured,
  ensureVectorSchema,
  indexDevSkills,
  countVectors
} from "@/lib/claw/vector-store";
import { DEV_SKILLS } from "@/lib/claw/dev-skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export async function GET() {
  if (!(await requireAdmin())) return json({ error: "Unauthorized" }, 401);

  const vectorConfigured = isVectorStoreConfigured();
  const embedConfigured = isEmbedConfigured();
  let stored: number | null = null;
  let error: string | undefined;
  if (vectorConfigured) {
    try {
      stored = await countVectors();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  return json({
    vectorConfigured,
    embedConfigured,
    corpusSize: DEV_SKILLS.length,
    stored,
    ...(error ? { error } : {}),
    hint: vectorConfigured
      ? "POST to this route to (re)index. Add { force: true } to re-embed everything."
      : "Set VECTOR_DATABASE_URL or DATABASE_URL (DO Managed Postgres with pgvector) to enable vector retrieval."
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return json({ error: "Unauthorized" }, 401);

  if (!isVectorStoreConfigured()) {
    return json({ error: "No vector DB configured. Set VECTOR_DATABASE_URL or DATABASE_URL." }, 503);
  }
  if (!isEmbedConfigured()) {
    return json({ error: "NVIDIA API key not configured — cannot embed skills. Set NVIDIA_API_KEY or the nvidia_api_key setting." }, 503);
  }

  let force = false;
  try {
    const body = (await req.json()) as { force?: unknown };
    force = body?.force === true;
  } catch {
    // no body — default incremental index
  }

  try {
    await ensureVectorSchema();
    const report = await indexDevSkills({ force });
    return json(report);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

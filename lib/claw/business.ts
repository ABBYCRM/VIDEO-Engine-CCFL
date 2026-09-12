// First-class Claw tools for loaded business keys (settings first, then env).
// Fail-soft: missing keys return { ok:false, code:"MISSING_KEY" }. Never echo a raw key.

import { firstSecret, missing, secret, timedFetch } from "@/lib/claw/connectors";
import { validateSteelUrl } from "@/lib/steel-url";

const CLIP = 8_000;

function clip(value: unknown, max = CLIP): unknown {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (text.length <= max) return value;
    const truncated = text.slice(0, max);
    return typeof value === "string"
      ? `${truncated}\n…[truncated]`
      : { truncated: true, preview: truncated };
  } catch {
    return value;
  }
}

function redact(text: string, keys: string[]): string {
  let out = text;
  for (const key of keys) {
    if (key.length >= 4) out = out.split(key).join("[redacted]");
  }
  return out;
}

function hintText(body: unknown, keys: string[]): string {
  if (body && typeof body === "object") {
    const row = body as Record<string, unknown>;
    const raw = row.error || row.message || row.detail || row.hint;
    if (typeof raw === "string") return redact(raw, keys).slice(0, 240);
  }
  return typeof body === "string" ? redact(body, keys).slice(0, 240) : "";
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function youtubeKey() {
  return secret("youtube_api_key", "YOUTUBE_API_KEY");
}

export async function youtubeSearch(input: { q?: string; maxResults?: number; type?: string }) {
  const key = youtubeKey();
  if (!key) return missing("YouTube", "YOUTUBE_API_KEY", "search public YouTube videos (youtube_search)");
  const q = str(input.q).trim();
  if (!q) return { ok: false as const, error: "q is required", code: "BAD_ARGS" };
  const maxResults = Math.min(15, Math.max(1, num(input.maxResults, 5)));
  const type = str(input.type, "video") || "video";
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", q);
  url.searchParams.set("type", type);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("key", key);
  const res = await timedFetch(url.toString(), { headers: { Accept: "application/json" } });
  const body = await readBody(res);
  if (!res.ok) return { ok: false as const, error: `YouTube HTTP ${res.status}`, hint: hintText(body, [key]) };
  const items = Array.isArray((body as any)?.items) ? (body as any).items : [];
  return {
    ok: true as const,
    via: "youtube",
    query: q,
    results: items.slice(0, maxResults).map((item: any) => ({
      videoId: item?.id?.videoId || item?.id?.channelId || item?.id?.playlistId || null,
      kind: item?.id?.kind || null,
      title: item?.snippet?.title || null,
      channel: item?.snippet?.channelTitle || null,
      publishedAt: item?.snippet?.publishedAt || null,
      description: String(item?.snippet?.description || "").slice(0, 280)
    }))
  };
}

export async function youtubeVideo(input: { id?: string }) {
  const key = youtubeKey();
  if (!key) return missing("YouTube", "YOUTUBE_API_KEY", "look up one YouTube video (youtube_video)");
  const id = str(input.id).trim();
  if (!id || /[^a-zA-Z0-9_-]/.test(id)) return { ok: false as const, error: "id must be a YouTube video id", code: "BAD_ARGS" };
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,contentDetails,statistics");
  url.searchParams.set("id", id);
  url.searchParams.set("key", key);
  const res = await timedFetch(url.toString(), { headers: { Accept: "application/json" } });
  const body = await readBody(res);
  if (!res.ok) return { ok: false as const, error: `YouTube HTTP ${res.status}`, hint: hintText(body, [key]) };
  const item = Array.isArray((body as any)?.items) ? (body as any).items[0] : null;
  if (!item) return { ok: false as const, error: "video not found", via: "youtube" };
  return {
    ok: true as const,
    via: "youtube",
    video: {
      id: item.id,
      title: item.snippet?.title || null,
      channel: item.snippet?.channelTitle || null,
      publishedAt: item.snippet?.publishedAt || null,
      duration: item.contentDetails?.duration || null,
      views: item.statistics?.viewCount || null,
      description: String(item.snippet?.description || "").slice(0, 800)
    }
  };
}

function geminiKey() {
  return secret("gemini_api_key", "GEMINI_API_KEY");
}

export async function llmGemini(input: { prompt?: string; model?: string; imageUrl?: string; imageBase64?: string; mimeType?: string }) {
  const key = geminiKey();
  if (!key) return missing("Gemini", "GEMINI_API_KEY", "Gemini chat/vision when the operator names Gemini or needs that vision path");
  const prompt = str(input.prompt).trim();
  if (!prompt) return { ok: false as const, error: "prompt is required", code: "BAD_ARGS" };
  const model = str(input.model, "gemini-2.0-flash") || "gemini-2.0-flash";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) return { ok: false as const, error: "model must be a Gemini model id", code: "BAD_ARGS" };
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  const imageBase64 = str(input.imageBase64).replace(/^data:[^;]+;base64,/, "").trim();
  if (imageBase64) {
    parts.push({ inline_data: { mime_type: str(input.mimeType, "image/jpeg") || "image/jpeg", data: imageBase64 } });
  } else if (str(input.imageUrl).trim()) {
    try {
      const target = validateSteelUrl(str(input.imageUrl).trim());
      const img = await timedFetch(target, { headers: { Accept: "image/*" } }, 15_000);
      if (!img.ok) return { ok: false as const, error: `image fetch HTTP ${img.status}`, hint: "Pass a public image URL or imageBase64." };
      const buf = Buffer.from(await img.arrayBuffer());
      if (buf.length > 4_000_000) return { ok: false as const, error: "image exceeds 4 MB" };
      const mime = img.headers.get("content-type")?.split(";")[0] || str(input.mimeType, "image/jpeg") || "image/jpeg";
      parts.push({ inline_data: { mime_type: mime, data: buf.toString("base64") } });
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e), hint: "Gemini vision needs a public image URL or imageBase64." };
    }
  }
  const res = await timedFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }] })
  });
  const body = await readBody(res);
  if (!res.ok) return { ok: false as const, error: `Gemini HTTP ${res.status}`, hint: hintText(body, [key]) };
  const text = String((body as any)?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join("\n") || "").trim();
  return { ok: true as const, via: "gemini", model, text: text.slice(0, CLIP), vision: parts.length > 1 };
}

function xaiKey() {
  return secret("xai_api_key", "XAI_API_KEY");
}

export async function llmXai(input: { prompt?: string; model?: string }) {
  const key = xaiKey();
  if (!key) return missing("xAI", "XAI_API_KEY", "xAI Grok chat/completions when the operator names Grok/xAI");
  const prompt = str(input.prompt).trim();
  if (!prompt) return { ok: false as const, error: "prompt is required", code: "BAD_ARGS" };
  const model = str(input.model, "grok-4-fast-non-reasoning") || "grok-4-fast-non-reasoning";
  const res = await timedFetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.3 })
  });
  const body = await readBody(res);
  if (!res.ok) return { ok: false as const, error: `xAI HTTP ${res.status}`, hint: hintText(body, [key]) };
  const text = String((body as any)?.choices?.[0]?.message?.content || "").trim();
  return { ok: true as const, via: "xai", model, text: text.slice(0, CLIP) };
}

function kimiKey() {
  return secret("kimi_api_key", "KIMI_API_KEY");
}

export async function llmKimi(input: { prompt?: string; model?: string }) {
  const key = kimiKey();
  if (!key) return missing("Kimi", "KIMI_API_KEY", "Moonshot Kimi chat/completions when the operator names Kimi");
  const prompt = str(input.prompt).trim();
  if (!prompt) return { ok: false as const, error: "prompt is required", code: "BAD_ARGS" };
  const model = str(input.model, "moonshot-v1-auto") || "moonshot-v1-auto";
  const base = (secret("kimi_base_url", "KIMI_BASE_URL") || "https://api.moonshot.ai/v1").replace(/\/$/, "");
  const res = await timedFetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.3 })
  });
  const body = await readBody(res);
  if (!res.ok) return { ok: false as const, error: `Kimi HTTP ${res.status}`, hint: hintText(body, [key]) };
  const text = String((body as any)?.choices?.[0]?.message?.content || "").trim();
  return { ok: true as const, via: "kimi", model, text: text.slice(0, CLIP) };
}

function openaiChatKey() {
  return firstSecret([["openai_api_key", "OPENAI_API_KEY"]]);
}

function openaiEmbedKey() {
  return firstSecret([
    ["openai_embeddings_api_key", "OPENAI_EMBEDDINGS_API_KEY"],
    ["openai_embeddings", "OPENAI_EMBEDDINGS"],
    ["openai_api_key", "OPENAI_API_KEY"]
  ]);
}

export async function openaiChat(input: { prompt?: string; model?: string }) {
  const key = openaiChatKey();
  if (!key) return missing("OpenAI", "OPENAI_API_KEY", "OpenAI chat when the operator names OpenAI/GPT");
  const prompt = str(input.prompt).trim();
  if (!prompt) return { ok: false as const, error: "prompt is required", code: "BAD_ARGS" };
  const model = str(input.model, "gpt-4o-mini") || "gpt-4o-mini";
  const res = await timedFetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.3 })
  });
  const body = await readBody(res);
  if (!res.ok) return { ok: false as const, error: `OpenAI HTTP ${res.status}`, hint: hintText(body, [key]) };
  const text = String((body as any)?.choices?.[0]?.message?.content || "").trim();
  return { ok: true as const, via: "openai", model, text: text.slice(0, CLIP) };
}

export async function openaiEmbed(input: { text?: string; model?: string }) {
  const key = openaiEmbedKey();
  if (!key) return missing("OpenAI embeddings", "OPENAI_API_KEY", "embed text for Pinecone or local retrieval (openai_embed)");
  const text = str(input.text).trim();
  if (!text) return { ok: false as const, error: "text is required", code: "BAD_ARGS" };
  const model = str(input.model, "text-embedding-3-small") || "text-embedding-3-small";
  const res = await timedFetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text.slice(0, 20_000) })
  });
  const body = await readBody(res);
  if (!res.ok) return { ok: false as const, error: `OpenAI embeddings HTTP ${res.status}`, hint: hintText(body, [key]) };
  const vector = (body as any)?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) return { ok: false as const, error: "OpenAI embeddings returned no vector" };
  return { ok: true as const, via: "openai", model, dimensions: vector.length, vector };
}

function pineconeKey() {
  return secret("pinecone_api_key", "PINECONE_API_KEY");
}

function pineconeHost() {
  return firstSecret([
    ["pinecone_index_host", "PINECONE_INDEX_HOST"],
    ["pinecone_host", "PINECONE_HOST"]
  ]).replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function pineconeIndexName() {
  return firstSecret([["pinecone_index", "PINECONE_INDEX"], ["pinecone_index_name", "PINECONE_INDEX_NAME"]]);
}

async function resolvePineconeHost(key: string): Promise<{ host: string } | { ok: false; error: string; code?: string; hint?: string }> {
  const direct = pineconeHost();
  if (direct) return { host: direct };
  const name = pineconeIndexName();
  if (!name) {
    return {
      ok: false,
      error: "Pinecone index host is not configured.",
      code: "MISSING_HOST",
      hint: "Set PINECONE_INDEX_HOST (or PINECONE_INDEX so the control plane can resolve the host). pinecone_query without a vector lists indexes."
    };
  }
  const res = await timedFetch(`https://api.pinecone.io/indexes/${encodeURIComponent(name)}`, {
    headers: { "Api-Key": key, Accept: "application/json" }
  });
  const body = await readBody(res);
  if (!res.ok) return { ok: false, error: `Pinecone HTTP ${res.status}`, hint: hintText(body, [key]) };
  const host = String((body as any)?.host || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!host) return { ok: false, error: "Pinecone index describe returned no host", hint: "Set PINECONE_INDEX_HOST." };
  return { host };
}

export async function pineconeQuery(input: { vector?: number[]; text?: string; topK?: number; namespace?: string; includeMetadata?: boolean }) {
  const key = pineconeKey();
  if (!key) return missing("Pinecone", "PINECONE_API_KEY", "query or list Pinecone indexes (pinecone_query)");
  const topK = Math.min(20, Math.max(1, num(input.topK, 5)));
  let vector = Array.isArray(input.vector) ? input.vector.filter((n) => Number.isFinite(n)) : [];
  if (!vector.length && str(input.text).trim()) {
    const embedded = await openaiEmbed({ text: str(input.text) });
    if (!embedded.ok) return { ...embedded, hint: (embedded as any).hint || "pinecone_query text= needs openai_embed (OPENAI_API_KEY)." };
    vector = embedded.vector;
  }
  if (!vector.length) {
    const res = await timedFetch("https://api.pinecone.io/indexes", {
      headers: { "Api-Key": key, Accept: "application/json" }
    });
    const body = await readBody(res);
    if (!res.ok) return { ok: false as const, error: `Pinecone HTTP ${res.status}`, hint: hintText(body, [key]) };
    const indexes = Array.isArray((body as any)?.indexes) ? (body as any).indexes : Array.isArray(body) ? body : [];
    return {
      ok: true as const,
      via: "pinecone",
      mode: "list-indexes",
      indexes: indexes.slice(0, 20).map((idx: any) => ({ name: idx.name || idx.id, host: idx.host || null, dimension: idx.dimension || idx.spec?.dimension || null })),
      note: "No vector/text provided — listed indexes. Pass vector or text to query. BOS memory stays Brain bos_memory."
    };
  }
  const resolved = await resolvePineconeHost(key);
  if ("ok" in resolved && resolved.ok === false) return resolved;
  const host = "host" in resolved ? resolved.host : "";
  const res = await timedFetch(`https://${host}/query`, {
    method: "POST",
    headers: { "Api-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      vector,
      topK,
      includeMetadata: input.includeMetadata !== false,
      namespace: str(input.namespace) || undefined
    })
  });
  const body = await readBody(res);
  if (!res.ok) return { ok: false as const, error: `Pinecone HTTP ${res.status}`, hint: hintText(body, [key]) };
  return { ok: true as const, via: "pinecone", mode: "query", matches: clip((body as any)?.matches || body) };
}

export async function pineconeUpsert(input: { id?: string; vector?: number[]; text?: string; metadata?: unknown; namespace?: string }) {
  const key = pineconeKey();
  if (!key) return missing("Pinecone", "PINECONE_API_KEY", "upsert a vector (pinecone_upsert). Operator must ask.");
  const id = str(input.id).trim();
  if (!id) return { ok: false as const, error: "id is required", code: "BAD_ARGS" };
  let values = Array.isArray(input.vector) ? input.vector.filter((n) => Number.isFinite(n)) : [];
  if (!values.length && str(input.text).trim()) {
    const embedded = await openaiEmbed({ text: str(input.text) });
    if (!embedded.ok) return { ...embedded, hint: (embedded as any).hint || "pinecone_upsert text= needs openai_embed (OPENAI_API_KEY)." };
    values = embedded.vector;
  }
  if (!values.length) return { ok: false as const, error: "vector or text is required", code: "BAD_ARGS" };
  const resolved = await resolvePineconeHost(key);
  if ("ok" in resolved && resolved.ok === false) return resolved;
  const host = "host" in resolved ? resolved.host : "";
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : str(input.text) ? { text: str(input.text).slice(0, 500) } : undefined;
  const res = await timedFetch(`https://${host}/vectors/upsert`, {
    method: "POST",
    headers: { "Api-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      vectors: [{ id, values, metadata }],
      namespace: str(input.namespace) || undefined
    })
  });
  const body = await readBody(res);
  if (!res.ok) return { ok: false as const, error: `Pinecone HTTP ${res.status}`, hint: hintText(body, [key]) };
  return { ok: true as const, via: "pinecone", upsertedCount: (body as any)?.upsertedCount ?? 1, id };
}

function hedraKey() {
  return secret("hedra_api_key", "HEDRA_API_KEY");
}

function hedraHeaders(key: string): HeadersInit {
  return { Authorization: `Key ${key}`, Accept: "application/json", "Content-Type": "application/json" };
}

export async function hedraStart(input: {
  prompt?: string;
  model?: string;
  quality?: string;
  aspectRatio?: string;
  resolution?: string;
  durationMs?: number;
  imageUrl?: string;
  audioUrl?: string;
}) {
  const key = hedraKey();
  if (!key) return missing("Hedra", "HEDRA_API_KEY", "start a Hedra v3 image or video job (hedra_start)");
  const prompt = str(input.prompt).trim();
  if (!prompt) return { ok: false as const, error: "prompt is required", code: "BAD_ARGS" };
  const model = str(input.model, "gpt-image-2") || "gpt-image-2";
  if (!/^[a-zA-Z0-9._-]+$/.test(model)) return { ok: false as const, error: "model must be a Hedra public model id", code: "BAD_ARGS" };
  const payload: Record<string, unknown> = {
    prompt,
    quality: str(input.quality, "medium") || "medium",
    aspect_ratio: str(input.aspectRatio, "1:1") || "1:1",
    resolution: str(input.resolution, "1K") || "1K"
  };
  if (input.durationMs) payload.duration_ms = Math.min(20_000, Math.max(1_000, num(input.durationMs, 8_000)));
  if (str(input.imageUrl).trim()) payload.image_url = str(input.imageUrl).trim();
  if (str(input.audioUrl).trim()) payload.audio_url = str(input.audioUrl).trim();
  const res = await timedFetch(`https://api.hedra.com/v3/models/${model}`, {
    method: "POST",
    headers: hedraHeaders(key),
    body: JSON.stringify({ input: payload })
  }, 30_000);
  const body = await readBody(res);
  if (!res.ok) {
    return {
      ok: false as const,
      error: `Hedra HTTP ${res.status}`,
      hint: hintText(body, [key]) || "Image models accept prompt-only. Character / I2V video may need a start image (and audio). Call hedra_status for the catalog.",
      model
    };
  }
  const jobId = String((body as any)?.job_id || (body as any)?.id || (body as any)?.jobId || "").trim();
  return {
    ok: true as const,
    via: "hedra",
    model,
    jobId: jobId || null,
    statusUrl: (body as any)?.status_url || (jobId ? `https://api.hedra.com/v3/jobs/${jobId}/status` : null),
    resultUrl: (body as any)?.result_url || (jobId ? `https://api.hedra.com/v3/jobs/${jobId}` : null),
    ack: clip(body),
    note: "Poll hedra_job with this jobId. Do not claim the media exists until status is COMPLETED."
  };
}

export async function hedraJob(input: { jobId?: string }) {
  const key = hedraKey();
  if (!key) return missing("Hedra", "HEDRA_API_KEY", "poll a Hedra v3 job (hedra_job)");
  const jobId = str(input.jobId).trim();
  if (!jobId || /[^a-zA-Z0-9._-]+/.test(jobId)) return { ok: false as const, error: "jobId is required", code: "BAD_ARGS" };
  const statusRes = await timedFetch(`https://api.hedra.com/v3/jobs/${encodeURIComponent(jobId)}/status`, {
    headers: { Authorization: `Key ${key}`, Accept: "application/json" }
  });
  const statusBody = await readBody(statusRes);
  if (!statusRes.ok) return { ok: false as const, error: `Hedra HTTP ${statusRes.status}`, hint: hintText(statusBody, [key]), jobId };
  const status = String((statusBody as any)?.status || (statusBody as any)?.state || "").toUpperCase();
  let result: unknown = null;
  if (status === "COMPLETED" || status === "SUCCEEDED" || status === "SUCCESS") {
    const resultRes = await timedFetch(`https://api.hedra.com/v3/jobs/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Key ${key}`, Accept: "application/json" }
    });
    if (resultRes.ok) result = clip(await readBody(resultRes));
  }
  return { ok: true as const, via: "hedra", jobId, status: status || "UNKNOWN", statusBody: clip(statusBody), result };
}

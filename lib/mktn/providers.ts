import { buildMarketingPlan } from "./engine.ts";
import { getMktnProviderSecret } from "./settings.ts";
import type { ImageGenerationInput, ImageGenerationResult, ImageProviderId, MarketingBrief, MarketingPlan } from "./types.ts";

const HEDRA_BASE = "https://api.hedra.com/v3";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const A2E_BASE = "https://video.a2e.ai";
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;
const POLL_WAIT_MS = 20_000;
export const IMAGE_PROVIDER_ORDER: readonly ImageProviderId[] = ["hedra", "gemini", "a2e"];

class ProviderFailure extends Error {
  constructor(readonly provider: string, message: string) {
    super(message);
    this.name = "ProviderFailure";
  }
}

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(Bearer|Key)\s+[A-Za-z0-9._:-]+/gi, "$1 [redacted]").slice(0, 300);
}

async function fetchJson(url: string, init: RequestInit, provider: string): Promise<Record<string, unknown>> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
  } catch (error) {
    throw new ProviderFailure(provider, `${provider} request failed: ${cleanError(error)}`);
  }
  const text = await response.text();
  let body: Record<string, unknown> = {};
  if (text) {
    try { body = JSON.parse(text) as Record<string, unknown>; }
    catch { body = { message: text.slice(0, 300) }; }
  }
  if (!response.ok) {
    const detail = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : `HTTP ${response.status}`;
    throw new ProviderFailure(provider, `${provider} returned ${response.status}: ${cleanError(detail)}`);
  }
  return body;
}

function deepStrings(value: unknown, keys: readonly string[]): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => deepStrings(item, keys));
  const object = value as Record<string, unknown>;
  const own = keys.flatMap((key) => typeof object[key] === "string" ? [object[key] as string] : []);
  return [...own, ...Object.values(object).flatMap((item) => deepStrings(item, keys))];
}

function jobId(value: unknown): string | null {
  return deepStrings(value, ["job_id", "task_id", "_id", "id"])[0] ?? null;
}

function outputUrl(value: unknown): string | null {
  return deepStrings(value, ["url", "output_url", "image_url", "result_url"]).find((candidate) => /^https:\/\//i.test(candidate)) ?? null;
}

function terminalStatus(value: unknown): string {
  return (deepStrings(value, ["status", "state"])[0] ?? "").toUpperCase();
}

async function poll(
  provider: ImageProviderId,
  read: () => Promise<Record<string, unknown>>,
): Promise<{ status: "complete" | "pending"; body: Record<string, unknown> }> {
  const deadline = Date.now() + POLL_WAIT_MS;
  let last: Record<string, unknown> = {};
  while (Date.now() < deadline) {
    last = await read();
    const status = terminalStatus(last);
    if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS"].includes(status)) return { status: "complete", body: last };
    if (["FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(status)) {
      throw new ProviderFailure(provider, `${provider} job ended with ${status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  return { status: "pending", body: last };
}

async function hedra(input: ImageGenerationInput): Promise<Omit<ImageGenerationResult, "failures">> {
  const key = getMktnProviderSecret("hedra");
  if (!key) throw new ProviderFailure("hedra", "Hedra is not configured.");
  const model = process.env.MKTN_HEDRA_IMAGE_MODEL?.trim() || "gpt-image-2";
  const body = await fetchJson(`${HEDRA_BASE}/models/${encodeURIComponent(model)}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: { prompt: input.prompt, quality: "medium", aspect_ratio: input.aspectRatio ?? "1:1", resolution: "1K" } }),
  }, "hedra");
  const id = jobId(body);
  if (!id) throw new ProviderFailure("hedra", "Hedra accepted no identifiable job.");
  const result = await poll("hedra", () => fetchJson(`${HEDRA_BASE}/jobs/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Key ${key}`, Accept: "application/json" },
  }, "hedra"));
  const url = outputUrl(result.body);
  if (result.status === "complete" && !url) throw new ProviderFailure("hedra", "Hedra completed without an output URL.");
  return { provider: "hedra", status: result.status, jobId: id, ...(url ? { url } : {}) };
}

function findGeminiImage(value: unknown): { data: string; mime: string } | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findGeminiImage(item); if (found) return found; }
    return null;
  }
  const object = value as Record<string, unknown>;
  const data = object.data ?? object.bytesBase64Encoded ?? object.bytes_base64_encoded;
  const mime = object.mime_type ?? object.mimeType ?? "image/png";
  if (typeof data === "string" && typeof mime === "string" && mime.startsWith("image/")) return { data, mime };
  for (const item of Object.values(object)) { const found = findGeminiImage(item); if (found) return found; }
  return null;
}

async function gemini(input: ImageGenerationInput): Promise<Omit<ImageGenerationResult, "failures">> {
  const key = getMktnProviderSecret("gemini");
  if (!key) throw new ProviderFailure("gemini", "Gemini is not configured.");
  const model = process.env.MKTN_GEMINI_IMAGE_MODEL?.trim() || "gemini-3.1-flash-lite-image";
  const body = await fetchJson(`${GEMINI_BASE}/interactions`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: [{ type: "text", text: `${input.prompt}\nOutput aspect ratio: ${input.aspectRatio ?? "1:1"}.` }] }),
  }, "gemini");
  const image = findGeminiImage(body);
  if (!image) throw new ProviderFailure("gemini", "Gemini returned no image payload.");
  return { provider: "gemini", status: "complete", dataUrl: `data:${image.mime};base64,${image.data}` };
}

async function a2e(input: ImageGenerationInput): Promise<Omit<ImageGenerationResult, "failures">> {
  const key = getMktnProviderSecret("a2e");
  if (!key) throw new ProviderFailure("a2e", "A2E is not configured.");
  const body = await fetchJson(`${A2E_BASE}/api/v1/userText2Image/start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "MKTN generated image",
      prompt: input.prompt,
      width: input.width ?? 1024,
      height: input.height ?? 1024,
      aspect_ratio: input.aspectRatio ?? "1:1",
      resolution: "1K",
      model_type: "a2e",
      max_images: 1,
    }),
  }, "a2e");
  const id = jobId(body);
  if (!id) throw new ProviderFailure("a2e", "A2E accepted no identifiable task.");
  const result = await poll("a2e", () => fetchJson(`${A2E_BASE}/api/v1/userText2Image/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  }, "a2e"));
  const url = outputUrl(result.body);
  if (result.status === "complete" && !url) throw new ProviderFailure("a2e", "A2E completed without an output URL.");
  return { provider: "a2e", status: result.status, jobId: id, ...(url ? { url } : {}) };
}

export async function generateImageWithFallback(raw: unknown): Promise<ImageGenerationResult> {
  if (!raw || typeof raw !== "object") throw new TypeError("Image request must be an object.");
  const body = raw as Record<string, unknown>;
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt || prompt.length > 8_000) throw new TypeError("prompt must contain 1 to 8,000 characters.");
  const ratios = ["1:1", "16:9", "9:16", "4:3", "3:4"] as const;
  const aspectRatio = ratios.includes(body.aspectRatio as typeof ratios[number]) ? body.aspectRatio as typeof ratios[number] : "1:1";
  const input: ImageGenerationInput = { prompt, aspectRatio };
  const failures: Array<{ provider: ImageProviderId; reason: string }> = [];
  const providers = { hedra, gemini, a2e } as const;
  for (const provider of IMAGE_PROVIDER_ORDER) {
    try {
      // A pending accepted job is a successful hand-off. Do not fail over and
      // create a duplicate paid generation simply because polling timed out.
      return { ...(await providers[provider](input)), failures };
    } catch (error) {
      failures.push({ provider, reason: cleanError(error) });
    }
  }
  throw new AggregateError(failures.map((failure) => new Error(`${failure.provider}: ${failure.reason}`)), "Every image provider failed.");
}

export async function runFastMarketingPlan(raw: unknown): Promise<{ plan: MarketingPlan; narrative: string; provider: "nvidia" | "deterministic"; warning?: string }> {
  const plan = buildMarketingPlan(raw);
  const key = getMktnProviderSecret("nvidia");
  if (!key) return { plan, narrative: JSON.stringify(plan, null, 2), provider: "deterministic", warning: "NVIDIA is not configured; used the deterministic engine." };
  const model = process.env.CLAW_NVIDIA_MODEL?.trim() || "nvidia/nemotron-3.5-lightning-30b-a3b";
  try {
    const body = await fetchJson(`${NVIDIA_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 1_800,
        stream: false,
        messages: [
          { role: "system", content: "You are the MKTN execution layer inside Claw. Turn the supplied verified plan into a concise campaign brief. Do not invent proof, testimonials, urgency, guarantees, settlements, diagnoses, or police/news evidence. Preserve every guardrail." },
          { role: "user", content: JSON.stringify(plan) },
        ],
      }),
    }, "nvidia");
    const choices = Array.isArray(body.choices) ? body.choices as Array<Record<string, unknown>> : [];
    const message = choices[0]?.message as Record<string, unknown> | undefined;
    const narrative = typeof message?.content === "string" ? message.content.trim() : "";
    if (!narrative) throw new ProviderFailure("nvidia", "NVIDIA returned no text.");
    return { plan, narrative, provider: "nvidia" };
  } catch (error) {
    return { plan, narrative: JSON.stringify(plan, null, 2), provider: "deterministic", warning: cleanError(error) };
  }
}

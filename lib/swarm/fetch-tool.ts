import { guardFetchUrl, SWARM_FETCH_BYTES, SWARM_FETCH_CHARS, SWARM_FETCH_TIMEOUT_MS } from "./policy";

export type FetchEvidence = {
  ok: boolean;
  url: string;
  title: string;
  text: string;
  error?: string;
};

export async function fetchPublicPage(raw: string, signal?: AbortSignal): Promise<FetchEvidence> {
  const guarded = guardFetchUrl(raw);
  if (!guarded.ok) return { ok: false, url: String(raw), title: "", text: "", error: guarded.error };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SWARM_FETCH_TIMEOUT_MS);
  const onAbort = () => ac.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(guarded.url, {
      method: "GET",
      redirect: "follow",
      headers: { Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.1" },
      signal: ac.signal,
    });
    if (!res.ok) return { ok: false, url: guarded.url, title: "", text: "", error: `HTTP ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    const slice = buf.byteLength > SWARM_FETCH_BYTES ? buf.slice(0, SWARM_FETCH_BYTES) : buf;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
    const text = stripMarkup(html).slice(0, SWARM_FETCH_CHARS);
    return { ok: true, url: guarded.url, title, text };
  } catch (e) {
    return {
      ok: false,
      url: guarded.url,
      title: "",
      text: "",
      error: e instanceof Error ? e.message : "fetch failed",
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function stripMarkup(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

import { guardFetchUrl, SWARM_FETCH_BYTES, SWARM_FETCH_CHARS, SWARM_FETCH_TIMEOUT_MS } from "./policy";

export type FetchEvidence = {
  ok: boolean;
  url: string;
  title: string;
  text: string;
  error?: string;
};

const MAX_HOPS = 5;

export async function fetchPublicPage(raw: string, signal?: AbortSignal): Promise<FetchEvidence> {
  const first = guardFetchUrl(raw);
  if (!first.ok) return { ok: false, url: String(raw), title: "", text: "", error: first.error };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), SWARM_FETCH_TIMEOUT_MS);
  const onAbort = () => ac.abort();
  signal?.addEventListener("abort", onAbort);

  let current = first.url;
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const gated = guardFetchUrl(current);
      if (!gated.ok) return { ok: false, url: current, title: "", text: "", error: gated.error };

      const res = await fetch(gated.url, {
        method: "GET",
        redirect: "manual",
        headers: { Accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.1" },
        signal: ac.signal,
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, url: gated.url, title: "", text: "", error: `Redirect ${res.status} missing Location` };
        let next: string;
        try {
          next = new URL(loc, gated.url).toString();
        } catch {
          return { ok: false, url: gated.url, title: "", text: "", error: "Redirect Location is not a URL" };
        }
        const nextGate = guardFetchUrl(next);
        if (!nextGate.ok) return { ok: false, url: next, title: "", text: "", error: `Blocked redirect: ${nextGate.error}` };
        current = nextGate.url;
        continue;
      }

      if (!res.ok) return { ok: false, url: gated.url, title: "", text: "", error: `HTTP ${res.status}` };
      const finalUrl = guardFetchUrl(res.url || gated.url);
      if (!finalUrl.ok) return { ok: false, url: res.url || gated.url, title: "", text: "", error: finalUrl.error };
      const buf = new Uint8Array(await res.arrayBuffer());
      const slice = buf.byteLength > SWARM_FETCH_BYTES ? buf.slice(0, SWARM_FETCH_BYTES) : buf;
      const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
      const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
      const text = stripMarkup(html).slice(0, SWARM_FETCH_CHARS);
      return { ok: true, url: finalUrl.url, title, text };
    }
    return { ok: false, url: current, title: "", text: "", error: "Too many redirects" };
  } catch (e) {
    return {
      ok: false,
      url: current,
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

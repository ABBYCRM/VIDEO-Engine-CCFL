// Public arXiv Atom search. No API key. Fail-soft on transport/parse errors.
// Documented export: http://export.arxiv.org/api/query — use HTTPS.

const ARXIV_QUERY = "https://export.arxiv.org/api/query";
const TIMEOUT_MS = 15_000;
const MAX_RESULTS = 10;

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? stripTags(m[1]) : "";
}

function authors(block: string): string[] {
  const out: string[] = [];
  const re = /<author[^>]*>[\s\S]*?<name[^>]*>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const name = stripTags(m[1]);
    if (name) out.push(name);
  }
  return out;
}

export function parseArxivAtom(xml: string, limit = MAX_RESULTS) {
  const entries: Array<{ id: string; title: string; summary: string; published: string; authors: string[] }> = [];
  const re = /<entry[^>]*>([\s\S]*?)<\/entry>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && entries.length < limit) {
    const block = m[1];
    entries.push({
      id: tag(block, "id"),
      title: tag(block, "title"),
      summary: tag(block, "summary").slice(0, 800),
      published: tag(block, "published"),
      authors: authors(block)
    });
  }
  return entries;
}

export async function arxivSearch(query: string, maxResults = 8) {
  const q = String(query || "").trim();
  if (!q) return { ok: false as const, error: "query is required", code: "BAD_ARGS" };
  const limit = Math.max(1, Math.min(MAX_RESULTS, Number(maxResults) || 8));
  const searchQuery = q.includes(":") ? q : `all:${q}`;
  const url = `${ARXIV_QUERY}?search_query=${encodeURIComponent(searchQuery)}&start=0&max_results=${limit}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ac.signal,
      cache: "no-store",
      headers: {
        Accept: "application/atom+xml, application/xml, text/xml",
        "User-Agent": "VIDEO-Engine-Claw/0.1 (arxiv_search; +https://github.com/ABBYCRM/VIDEO-Engine-CCFL)"
      }
    });
    const xml = await res.text();
    if (!res.ok) return { ok: false as const, error: `arXiv HTTP ${res.status}`, code: "HTTP_ERROR", hint: xml.slice(0, 200) };
    const papers = parseArxivAtom(xml, limit);
    return {
      ok: true as const,
      via: "arxiv",
      query: searchQuery,
      count: papers.length,
      papers
    };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : String(error),
      code: "TRANSPORT",
      hint: "Public arXiv export is unreachable. No results were fabricated."
    };
  } finally {
    clearTimeout(timer);
  }
}

// Thin GitHub API wrapper for Claw. Token is server-only.
const API = "https://api.github.com";

export function isGithubConfigured(): boolean {
  return Boolean(process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim());
}

function token() {
  const key = process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim();
  if (!key) throw new Error("GitHub is not configured. Set GITHUB_PERSONAL_ACCESS_TOKEN on the server.");
  return key;
}

export async function githubRequest(input: { method?: unknown; path?: unknown; body?: unknown }) {
  const method = String(input.method || "GET").toUpperCase();
  if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(method)) throw new Error("method must be GET, POST, PATCH, PUT, or DELETE.");
  const rawPath = String(input.path || "").trim();
  if (!rawPath.startsWith("/") || rawPath.includes("://") || rawPath.includes("..")) {
    throw new Error("path must be an api.github.com path starting with / (for example /repos/owner/name).");
  }
  const res = await fetch(API + rawPath, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(input.body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    cache: "no-store"
  });
  const text = await res.text();
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!res.ok) {
    const msg = typeof data === "object" && data && "message" in data ? String((data as { message: unknown }).message) : text.slice(0, 300);
    return { ok: false, status: res.status, error: msg };
  }
  return { ok: true, status: res.status, data };
}

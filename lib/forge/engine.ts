import { createServer } from "node:net";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { Browser, BrowserContext, Page } from "playwright";
import { inspectBrowser } from "./detector";
import { collectFingerprintInPage, fingerprintDigest } from "./fingerprint";
import {
  AD_HOST,
  DEFAULT_VIEWPORT,
  FORGE_MAX_LINKS,
  FORGE_MAX_MARKDOWN,
  FORGE_MAX_SESSIONS,
  clampDelay,
  detectForgeHandoff,
  evaluateForgeOp,
  guardPublicUrl,
  parseCreateInput,
} from "./policy";
import { describeStealth, initScriptFor } from "./stealth";
import type {
  ForgeCreateInput,
  ForgeEvent,
  ForgeHandoffReason,
  ForgeStatus,
  ProbeResult,
  PublicForgeSession,
  ScrapeLink,
  ScrapeResult,
  StealthMode,
} from "./types";
import { FORGE_CONTRACT } from "./types";

const ROOT = join(tmpdir(), "claw-forge");

type LiveForge = {
  id: string;
  status: ForgeStatus;
  createdAt: string;
  stealth: StealthMode;
  width: number;
  height: number;
  blockAds: boolean;
  persist: boolean;
  profileDir: string;
  cdpPort: number | null;
  cdpHttp: string | null;
  cdpWs: string | null;
  cookieCount: number;
  screenshotJpeg: string | null;
  lastAction: string | null;
  handoffReason: ForgeHandoffReason | null;
  events: ForgeEvent[];
  probe: ProbeResult | null;
  scrape: ScrapeResult | null;
  url: string;
  title: string;
  context?: BrowserContext;
  page?: Page;
  browser?: Browser;
};

const sessions = new Map<string, LiveForge>();
const locks = new Map<string, Promise<unknown>>();

function pushEvent(session: LiveForge, actor: ForgeEvent["actor"], eventType: string, note: string) {
  session.events.unshift({ actor, eventType, note, at: new Date().toISOString() });
  if (session.events.length > 48) session.events.length = 48;
}

async function withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(id) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(
    id,
    prev.then(() => gate),
  );
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

function toPublic(session: LiveForge): PublicForgeSession {
  return {
    id: session.id,
    status: session.status,
    createdAt: session.createdAt,
    url: session.url,
    title: session.title,
    stealth: session.stealth,
    width: session.width,
    height: session.height,
    blockAds: session.blockAds,
    persist: session.persist,
    cdpHttp: session.cdpHttp,
    cdpWs: session.cdpWs,
    cookieCount: session.cookieCount,
    screenshotJpeg: session.screenshotJpeg,
    lastAction: session.lastAction,
    handoffReason: session.handoffReason,
    events: session.events,
    probe: session.probe,
    scrape: session.scrape,
  };
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

const START_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>Claw Forge</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#f4f4f5;font-family:system-ui,sans-serif}
  main{width:min(640px,92vw)}
  h1{font-size:28px;font-weight:600;letter-spacing:-.03em;margin:0 0 8px}
  p{color:#a1a1aa;line-height:1.55}
  ul{color:#c8ccd4;line-height:1.6;padding-left:18px}
  .warn{color:#d6b56d}
</style></head><body>
<main>
  <h1>Claw Forge</h1>
  <p>Self-hosted Chromium control plane. Sessions persist cookies. CDP is loopback-only.</p>
  <ul>
    <li>Coherence init strips ChromeDriver leftovers</li>
    <li>Fingerprint lab measures the real surface</li>
    <li class="warn">CAPTCHA is not solved here. Puzzles pause for a human.</li>
  </ul>
</main>
</body></html>`;

async function refresh(session: LiveForge) {
  if (!session.page) return;
  session.url = session.page.url();
  session.title = await session.page.title().catch(() => "");
  try {
    const buf = await session.page.screenshot({ type: "jpeg", quality: 48, scale: "css" });
    session.screenshotJpeg = buf.toString("base64");
  } catch {
    /* keep last frame */
  }
  try {
    const cookies = await session.context?.cookies();
    session.cookieCount = cookies?.length ?? 0;
  } catch {
    session.cookieCount = 0;
  }
}

async function attachCdp(session: LiveForge) {
  if (!session.cdpPort) return;
  try {
    const res = await fetch(`http://127.0.0.1:${session.cdpPort}/json/version`);
    if (!res.ok) return;
    const body = (await res.json()) as { webSocketDebuggerUrl?: string };
    session.cdpHttp = `http://127.0.0.1:${session.cdpPort}`;
    session.cdpWs = body.webSocketDebuggerUrl ?? `ws://127.0.0.1:${session.cdpPort}/devtools/browser`;
  } catch {
    session.cdpHttp = `http://127.0.0.1:${session.cdpPort}`;
  }
}

export async function createForgeSession(raw?: unknown): Promise<PublicForgeSession> {
  if (sessions.size >= FORGE_MAX_SESSIONS) {
    throw new Error(`Forge is at capacity (${FORGE_MAX_SESSIONS} live Chromium sessions)`);
  }
  const input: ForgeCreateInput = parseCreateInput(raw);
  const id = randomUUID();
  const profileDir = join(ROOT, id, "profile");
  mkdirSync(profileDir, { recursive: true });
  const cdpPort = await freePort();
  const session: LiveForge = {
    id,
    status: "READY",
    createdAt: new Date().toISOString(),
    stealth: input.stealth ?? "coherence",
    width: input.width ?? DEFAULT_VIEWPORT.width,
    height: input.height ?? DEFAULT_VIEWPORT.height,
    blockAds: Boolean(input.blockAds),
    persist: input.persist !== false,
    profileDir,
    cdpPort,
    cdpHttp: null,
    cdpWs: null,
    cookieCount: 0,
    screenshotJpeg: null,
    lastAction: "create",
    handoffReason: null,
    events: [],
    probe: null,
    scrape: null,
    url: "about:blank",
    title: "Claw Forge",
  };

  const { chromium } = await import("playwright");
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    `--remote-debugging-port=${cdpPort}`,
    "--remote-debugging-address=127.0.0.1",
  ];
  const viewport = { width: session.width, height: session.height };
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport,
      locale: "en-US",
      args,
    });
  } catch {
    const browser = await chromium.launch({ headless: true, args });
    context = await browser.newContext({ viewport, locale: "en-US" });
    session.browser = browser;
    session.persist = false;
  }

  const script = initScriptFor(session.stealth);
  if (script) await context.addInitScript(script);

  if (session.blockAds) {
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (AD_HOST.test(url)) return route.abort();
      return route.continue();
    });
  }

  const page = context.pages()[0] ?? (await context.newPage());
  session.context = context;
  session.page = page;
  sessions.set(id, session);
  pushEvent(session, "system", "boot", describeStealth(session.stealth));
  await page.setContent(START_HTML, { waitUntil: "domcontentloaded" });
  await attachCdp(session);
  await refresh(session);
  session.status = "RUNNING";
  return toPublic(session);
}

export function listForgeSessions(): PublicForgeSession[] {
  return [...sessions.values()].map(toPublic);
}

export function getForgeSession(id?: string | null): PublicForgeSession | null {
  if (id) {
    const found = sessions.get(id);
    return found ? toPublic(found) : null;
  }
  const first = sessions.values().next().value as LiveForge | undefined;
  return first ? toPublic(first) : null;
}

async function requireSession(id: string): Promise<LiveForge> {
  const session = sessions.get(id);
  if (!session?.page) throw new Error("Forge session not found");
  return session;
}

async function extractDocument(page: Page): Promise<{ title: string; markdown: string; links: ScrapeLink[]; text: string }> {
  return page.evaluate((maxLinks: number) => {
    const links: { text: string; url: string }[] = [];
    const seen = new Set<string>();
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const href = (a as HTMLAnchorElement).href;
      if (!href || seen.has(href) || !/^https?:/i.test(href)) continue;
      seen.add(href);
      links.push({
        text: ((a as HTMLAnchorElement).innerText || href).replace(/\s+/g, " ").trim().slice(0, 120),
        url: href,
      });
      if (links.length >= maxLinks) break;
    }
    const blocks: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("h1,h2,h3,p,li,pre"))) {
      const t = (el as HTMLElement).innerText.replace(/\s+/g, " ").trim();
      if (!t) continue;
      const tag = el.tagName;
      if (tag === "H1") blocks.push(`# ${t}`);
      else if (tag === "H2") blocks.push(`## ${t}`);
      else if (tag === "H3") blocks.push(`### ${t}`);
      else if (tag === "LI") blocks.push(`- ${t}`);
      else if (tag === "PRE") blocks.push("```\n" + (el as HTMLElement).innerText.slice(0, 800) + "\n```");
      else blocks.push(t);
    }
    return {
      title: document.title,
      markdown: blocks.join("\n\n"),
      links,
      text: (document.body?.innerText || "").slice(0, 4000),
    };
  }, FORGE_MAX_LINKS);
}

async function maybeHandoff(session: LiveForge, pack: { title: string; text: string }): Promise<ForgeHandoffReason | null> {
  const hits = detectForgeHandoff({ url: session.page?.url() ?? "", title: pack.title, bodyText: pack.text });
  if (!hits.length) return null;
  session.handoffReason = hits[0];
  session.status = "HANDOFF";
  pushEvent(session, "system", "handoff", `Paused for human: ${hits[0]}. Forge will not click puzzle tiles.`);
  return hits[0];
}

export async function navigateForge(id: string, urlRaw: unknown): Promise<PublicForgeSession> {
  const gated = evaluateForgeOp("navigate");
  if (!gated.ok) throw new Error(gated.error);
  const safe = guardPublicUrl(urlRaw);
  if (!safe.ok) throw new Error(safe.error);
  return withLock(id, async () => {
    const session = await requireSession(id);
    session.status = "RUNNING";
    session.handoffReason = null;
    await session.page!.goto(safe.url, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await session.page!.waitForTimeout(400);
    const pack = await extractDocument(session.page!);
    await maybeHandoff(session, pack);
    session.lastAction = "navigate";
    pushEvent(session, "agent", "navigate", safe.url);
    await refresh(session);
    return toPublic(session);
  });
}

export async function scrapeWithForge(input: {
  url?: unknown;
  sessionId?: unknown;
  delayMs?: unknown;
  screenshot?: unknown;
}): Promise<{ session: PublicForgeSession | null; scrape: ScrapeResult }> {
  const gated = evaluateForgeOp("scrape", { url: input.url });
  if (!gated.ok) return { session: null, scrape: { ok: false, via: "claw-forge", url: "", statusCode: null, title: null, markdown: "", truncated: false, links: [], error: gated.error } };
  const safe = guardPublicUrl(input.url);
  if (!safe.ok) {
    return { session: null, scrape: { ok: false, via: "claw-forge", url: String(input.url ?? ""), statusCode: null, title: null, markdown: "", truncated: false, links: [], error: safe.error } };
  }
  const delay = clampDelay(input.delayMs);
  let created = false;
  let id = String(input.sessionId ?? "").trim();
  if (!id) {
    const createdSession = await createForgeSession({ stealth: "coherence", persist: true });
    id = createdSession.id;
    created = true;
  }
  try {
    return await withLock(id, async () => {
      const session = await requireSession(id);
      let statusCode: number | null = null;
      const response = await session.page!.goto(safe.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      statusCode = response?.status() ?? null;
      if (delay) await session.page!.waitForTimeout(delay);
      else await session.page!.waitForTimeout(350);
      const pack = await extractDocument(session.page!);
      const markdown = pack.markdown.slice(0, FORGE_MAX_MARKDOWN);
      const reason = await maybeHandoff(session, pack);
      let screenshotJpeg: string | null = null;
      if (input.screenshot === true) {
        const buf = await session.page!.screenshot({ type: "jpeg", quality: 48, scale: "css" });
        screenshotJpeg = buf.toString("base64");
      }
      const scrape: ScrapeResult = {
        ok: !reason,
        via: "claw-forge",
        url: session.page!.url(),
        statusCode,
        title: pack.title || null,
        markdown,
        truncated: pack.markdown.length > FORGE_MAX_MARKDOWN,
        links: pack.links.slice(0, FORGE_MAX_LINKS),
        screenshotJpeg,
        humanRequired: Boolean(reason),
        handoffReason: reason ?? undefined,
        error: reason ? `Paused for human (${reason}). Forge does not solve CAPTCHAs.` : undefined,
      };
      session.scrape = scrape;
      session.lastAction = "scrape";
      pushEvent(session, "agent", "scrape", `${safe.url} → ${reason ? reason : `${pack.links.length} links`}`);
      await refresh(session);
      return { session: toPublic(session), scrape };
    });
  } finally {
    if (created && input.sessionId == null && input.screenshot !== true) {
      /* keep ephemeral session so the operator can inspect the frame */
    }
  }
}

export async function probeForge(input: { sessionId?: unknown; url?: unknown }): Promise<{
  session: PublicForgeSession | null;
  probe: ProbeResult;
}> {
  const gated = evaluateForgeOp("probe");
  if (!gated.ok) {
    return {
      session: null,
      probe: { ok: false, fingerprint: null, digest: null, detector: { score: 0, findings: [], note: "" }, error: gated.error },
    };
  }
  let id = String(input.sessionId ?? "").trim();
  if (!id) {
    const created = await createForgeSession({ stealth: "coherence" });
    id = created.id;
  }
  if (input.url) {
    await navigateForge(id, input.url);
  }
  return withLock(id, async () => {
    const session = await requireSession(id);
    try {
      const fingerprint = await session.page!.evaluate(collectFingerprintInPage);
      const detector = inspectBrowser(fingerprint);
      const probe: ProbeResult = {
        ok: true,
        fingerprint,
        digest: fingerprintDigest(fingerprint),
        detector,
      };
      session.probe = probe;
      session.lastAction = "probe";
      pushEvent(session, "system", "probe", `anomaly ${detector.score} · ${detector.findings.map((f) => f.signal).join(", ") || "none"}`);
      await refresh(session);
      return { session: toPublic(session), probe };
    } catch (e) {
      const probe: ProbeResult = {
        ok: false,
        fingerprint: null,
        digest: null,
        detector: { score: 0, findings: [], note: "" },
        error: e instanceof Error ? e.message : "probe failed",
      };
      return { session: toPublic(session), probe };
    }
  });
}

export async function screenshotForge(id: string): Promise<PublicForgeSession> {
  return withLock(id, async () => {
    const session = await requireSession(id);
    await refresh(session);
    session.lastAction = "screenshot";
    return toPublic(session);
  });
}

export async function cookiesForge(id: string): Promise<{ session: PublicForgeSession; cookies: Array<{ name: string; domain: string; path: string }> }> {
  return withLock(id, async () => {
    const session = await requireSession(id);
    const cookies = (await session.context?.cookies()) ?? [];
    session.cookieCount = cookies.length;
    session.lastAction = "cookies";
    pushEvent(session, "system", "cookies", `${cookies.length} cookies in persistent profile`);
    return {
      session: toPublic(session),
      cookies: cookies.map((c) => ({ name: c.name, domain: c.domain, path: c.path })),
    };
  });
}

export async function storageForge(id: string): Promise<{ session: PublicForgeSession; localStorage: Record<string, string> }> {
  return withLock(id, async () => {
    const session = await requireSession(id);
    const localStorage = await session.page!.evaluate(() => {
      const out: Record<string, string> = {};
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (key) out[key] = window.localStorage.getItem(key) || "";
      }
      return out;
    });
    session.lastAction = "storage";
    return { session: toPublic(session), localStorage };
  });
}

export async function handoffForge(id: string, reason: ForgeHandoffReason = "manual"): Promise<PublicForgeSession> {
  return withLock(id, async () => {
    const session = await requireSession(id);
    session.status = "HANDOFF";
    session.handoffReason = reason;
    session.lastAction = "handoff";
    pushEvent(session, "human", "handoff", `Operator owns this session (${reason})`);
    await refresh(session);
    return toPublic(session);
  });
}

export async function resumeForge(id: string): Promise<PublicForgeSession> {
  return withLock(id, async () => {
    const session = await requireSession(id);
    session.status = "RUNNING";
    session.handoffReason = null;
    session.lastAction = "resume";
    pushEvent(session, "agent", "resume", "Control returned to Forge");
    await refresh(session);
    return toPublic(session);
  });
}

export async function releaseForgeSession(id: string): Promise<{ ok: true; id: string }> {
  const session = sessions.get(id);
  if (!session) return { ok: true, id };
  await session.context?.close().catch(() => undefined);
  await session.browser?.close().catch(() => undefined);
  sessions.delete(id);
  locks.delete(id);
  return { ok: true, id };
}

export function forgeStatus() {
  return {
    ok: true,
    contract: FORGE_CONTRACT,
    live: sessions.size,
    cap: FORGE_MAX_SESSIONS,
    sessions: listForgeSessions(),
  };
}

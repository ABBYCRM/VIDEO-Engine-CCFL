import { mkdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import type { Browser, BrowserContext, Page } from "playwright";
import { classifyPageForHandoff, evaluateAction, isSafePublicUrl, safeSessionFilename } from "./policy";
import type {
  ActionResult,
  ComputerAction,
  ControlOwner,
  HandoffReason,
  PageSnapshot,
  PublicSession,
  SessionArtifact,
  SessionStatus,
} from "./types";

const VIEWPORT = { width: 1280, height: 800 };
const MAX_EVENTS = 48;
const ROOT = join(tmpdir(), "claw-computer");

type EventRow = { actor: string; eventType: string; note: string; at: string };

type LiveSession = {
  id: string;
  status: SessionStatus;
  controlOwner: ControlOwner;
  lastAction: string | null;
  pointer: { x: number; y: number } | null;
  handoffReason: HandoffReason | null;
  screenshotJpeg: string | null;
  snapshot: PageSnapshot | null;
  artifacts: SessionArtifact[];
  events: EventRow[];
  downloadsDir: string;
  uploadsDir: string;
  profileDir: string;
  context?: BrowserContext;
  page?: Page;
  browser?: Browser;
};

const sessions = new Map<string, LiveSession>();
let activeId: string | null = null;

function pushEvent(session: LiveSession, actor: string, eventType: string, note: string) {
  session.events.unshift({ actor, eventType, note, at: new Date().toISOString() });
  if (session.events.length > MAX_EVENTS) session.events.length = MAX_EVENTS;
}

async function snapshotPage(page: Page): Promise<PageSnapshot> {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const pack = await page
    .evaluate(() => {
      const passwordFieldVisible = Boolean(
        document.querySelector('input[type="password"]:not([disabled])'),
      );
      const captchaFrame = [...document.querySelectorAll("iframe, [id], [class]")].some((el) => {
        const blob = `${el.id} ${el.className} ${(el as HTMLIFrameElement).src || ""}`.toLowerCase();
        return /recaptcha|hcaptcha|turnstile|captcha/.test(blob);
      });
      const bodyText = (document.body?.innerText || "").slice(0, 4000);
      const nodes = [
        ...document.querySelectorAll(
          'a, button, input, textarea, select, [role="button"], [role="link"], [role="textbox"]',
        ),
      ];
      const elements = nodes
        .slice(0, 90)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const text = (
            (el as HTMLElement).innerText ||
            el.getAttribute("aria-label") ||
            el.getAttribute("placeholder") ||
            el.getAttribute("value") ||
            el.getAttribute("name") ||
            ""
          )
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);
          return {
            tag: el.tagName.toLowerCase(),
            text,
            href: el.getAttribute("href") || undefined,
            type: el.getAttribute("type") || undefined,
            name: el.getAttribute("name") || undefined,
            placeholder: el.getAttribute("placeholder") || undefined,
            x: Math.round(r.x + r.width / 2),
            y: Math.round(r.y + r.height / 2),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        })
        .filter((n) => n.w > 2 && n.h > 2 && n.y >= 0 && n.x >= 0);
      return { passwordFieldVisible, captchaFrame, bodyText, elements };
    })
    .catch(() => ({
      passwordFieldVisible: false,
      captchaFrame: false,
      bodyText: "",
      elements: [] as PageSnapshot["elements"],
    }));

  const suspicious = classifyPageForHandoff({
    url,
    title,
    bodyText: pack.bodyText,
    passwordFieldVisible: pack.passwordFieldVisible,
    captchaFrame: pack.captchaFrame,
  });

  return { url, title, text: pack.bodyText.slice(0, 1800), elements: pack.elements, suspicious };
}

async function grabScreenshot(page: Page): Promise<string> {
  const buf = await page.screenshot({ type: "jpeg", quality: 52, scale: "css" });
  return buf.toString("base64");
}

async function refresh(session: LiveSession) {
  if (!session.page) return;
  session.snapshot = await snapshotPage(session.page);
  session.screenshotJpeg = await grabScreenshot(session.page);
}

function toPublic(session: LiveSession): PublicSession {
  return {
    id: session.id,
    status: session.status,
    controlOwner: session.controlOwner,
    url: session.snapshot?.url ?? "",
    title: session.snapshot?.title ?? "",
    lastAction: session.lastAction,
    pointer: session.pointer,
    handoffReason: session.handoffReason,
    screenshotJpeg: session.screenshotJpeg,
    snapshot: session.snapshot,
    artifacts: session.artifacts,
    events: session.events,
  };
}

function resolveClick(session: LiveSession, action: ComputerAction): { x: number; y: number } | null {
  if (typeof action.x === "number" && typeof action.y === "number") return { x: action.x, y: action.y };
  const needle = (action.text ?? action.field ?? "").trim().toLowerCase();
  if (!needle) return null;
  const el = session.snapshot?.elements.find((e) => {
    const blob = `${e.text} ${e.name ?? ""} ${e.placeholder ?? ""}`.toLowerCase();
    return blob.includes(needle);
  });
  return el ? { x: el.x, y: el.y } : null;
}

export function getActiveSession(): PublicSession | null {
  if (!activeId) return null;
  const s = sessions.get(activeId);
  return s ? toPublic(s) : null;
}

const START_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>Claw Computer</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0b;color:#f4f4f5;font-family:system-ui,sans-serif}
  main{width:min(560px,92vw)}
  h1{font-size:28px;font-weight:600;letter-spacing:-.03em;margin:0 0 8px}
  p{color:#a1a1aa;line-height:1.5}
  input{width:100%;height:48px;border-radius:12px;border:1px solid #2a2a30;background:#121214;color:#fff;padding:0 16px;font-size:16px}
  button{margin-top:12px;height:44px;padding:0 18px;border:0;border-radius:10px;background:#c8ccd4;color:#0a0a0b;font-weight:600;cursor:pointer}
  a{color:#c8ccd4}
</style></head><body>
<main>
  <h1>Claw Computer</h1>
  <p>Same Chrome session. Search, click, type. CAPTCHA and passwords pause for you.</p>
  <form action="https://duckduckgo.com/" method="get">
    <input name="q" placeholder="Search the web" aria-label="Search the web"/>
    <button type="submit">Search</button>
  </form>
</main>
</body></html>`;

export async function ensureSession(): Promise<PublicSession> {
  if (activeId) {
    const existing = sessions.get(activeId);
    if (existing?.page) return toPublic(existing);
  }
  const id = randomUUID();
  const base = join(ROOT, id);
  const downloadsDir = join(base, "downloads");
  const uploadsDir = join(base, "uploads");
  const profileDir = join(base, "profile");
  mkdirSync(downloadsDir, { recursive: true });
  mkdirSync(uploadsDir, { recursive: true });
  mkdirSync(profileDir, { recursive: true });

  const session: LiveSession = {
    id,
    status: "READY",
    controlOwner: "NONE",
    lastAction: null,
    pointer: null,
    handoffReason: null,
    screenshotJpeg: null,
    snapshot: null,
    artifacts: [],
    events: [],
    downloadsDir,
    uploadsDir,
    profileDir,
  };

  const { chromium } = await import("playwright");
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: VIEWPORT,
      acceptDownloads: true,
      locale: "en-US",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
  } catch {
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    context = await browser.newContext({ viewport: VIEWPORT, acceptDownloads: true, locale: "en-US" });
    session.browser = browser;
  }
  const page = context.pages()[0] ?? (await context.newPage());
  page.on("download", async (download) => {
    try {
      const name = download.suggestedFilename() || `file-${Date.now()}`;
      const dest = join(downloadsDir, name);
      await download.saveAs(dest);
      const bytes = existsSync(dest) ? statSync(dest).size : 0;
      session.artifacts.unshift({ name, kind: "download", bytes });
      pushEvent(session, "system", "download", name);
    } catch {
      pushEvent(session, "system", "download", "download failed");
    }
  });
  session.context = context;
  session.page = page;
  sessions.set(id, session);
  activeId = id;
  pushEvent(session, "system", "boot", "Persistent Chromium worker started");
  await page.setContent(START_HTML, { waitUntil: "domcontentloaded" });
  await refresh(session);
  return toPublic(session);
}

async function requireAgent(session: LiveSession) {
  if (session.controlOwner === "HUMAN") {
    throw new Error("Browser currently controlled by human");
  }
  if (session.controlOwner === "NONE") {
    session.controlOwner = "AGENT";
    session.status = "AGENT_RUNNING";
    pushEvent(session, "agent", "lease", "control_owner=AGENT");
  }
}

function requestHandoff(session: LiveSession, reason: HandoffReason, note: string) {
  session.controlOwner = "HUMAN";
  session.status = "HANDOFF_REQUESTED";
  session.handoffReason = reason;
  pushEvent(session, "agent", "handoff", note);
}

async function fillLabeled(page: Page, session: LiveSession, action: ComputerAction) {
  const label = (action.field || action.selector || "").trim();
  const value = action.text ?? "";
  if (label) {
    const byLabel = page.getByLabel(label, { exact: false });
    if ((await byLabel.count()) > 0) {
      await byLabel.first().fill(value);
      return;
    }
    const byPlaceholder = page.getByPlaceholder(label, { exact: false });
    if ((await byPlaceholder.count()) > 0) {
      await byPlaceholder.first().fill(value);
      return;
    }
    const byName = page.locator(`[name="${CSS.escape(label)}"], #${CSS.escape(label)}`);
    if ((await byName.count()) > 0) {
      await byName.first().fill(value);
      return;
    }
    const point = resolveClick(session, { type: "click", text: label });
    if (point) {
      session.pointer = point;
      await page.mouse.click(point.x, point.y);
    }
  }
  await page.keyboard.type(value, { delay: 16 });
}

export async function runAction(
  action: ComputerAction,
  actor: "agent" | "human" = "agent",
): Promise<ActionResult> {
  const session = activeId ? sessions.get(activeId) : undefined;
  if (!session?.page) {
    return { ok: false, decision: "DENY", error: "Computer is not running" };
  }

  const policy = evaluateAction(action);
  if (policy.decision === "DENY") {
    pushEvent(session, actor, "deny", policy.error || action.type);
    return { ok: false, decision: "DENY", error: policy.error };
  }
  if (policy.decision === "HUMAN_REQUIRED") {
    requestHandoff(session, policy.reason ?? "manual", policy.error || "Sensitive input");
    await refresh(session);
    return {
      ok: false,
      decision: "HUMAN_REQUIRED",
      handoffReason: session.handoffReason ?? undefined,
      snapshot: session.snapshot ?? undefined,
      screenshotJpeg: session.screenshotJpeg ?? undefined,
      artifacts: session.artifacts,
      error: "Paused for human takeover",
    };
  }

  if (action.type === "handoff") {
    requestHandoff(session, action.reason ?? "manual", `Agent requested ${action.reason ?? "manual"} takeover`);
    await refresh(session);
    return {
      ok: true,
      decision: "HUMAN_REQUIRED",
      handoffReason: session.handoffReason ?? undefined,
      snapshot: session.snapshot ?? undefined,
      screenshotJpeg: session.screenshotJpeg ?? undefined,
      artifacts: session.artifacts,
    };
  }

  if (action.type === "resume") {
    session.controlOwner = "AGENT";
    session.status = "AGENT_RUNNING";
    session.handoffReason = null;
    pushEvent(session, "human", "resume", "Control returned to Claw");
    await refresh(session);
    return {
      ok: true,
      decision: "ALLOW",
      snapshot: session.snapshot ?? undefined,
      screenshotJpeg: session.screenshotJpeg ?? undefined,
      artifacts: session.artifacts,
      note: "Do not assume what the human did. Continue from this screen.",
    };
  }

  if (actor === "agent") {
    try {
      await requireAgent(session);
    } catch (e) {
      return { ok: false, decision: "DENY", error: e instanceof Error ? e.message : "Locked" };
    }
  }

  const page = session.page;
  session.status = actor === "human" ? "HUMAN_ACTIVE" : "AGENT_RUNNING";
  if (actor === "human") session.controlOwner = "HUMAN";
  if (actor === "agent") session.controlOwner = "AGENT";

  try {
    switch (action.type) {
      case "screenshot":
        break;
      case "wait":
        await page.waitForTimeout(1200);
        break;
      case "move":
        await page.mouse.move(action.x ?? 0, action.y ?? 0);
        break;
      case "click": {
        const point = resolveClick(session, action);
        if (!point) return { ok: false, decision: "DENY", error: "No matching control to click" };
        session.pointer = point;
        await page.mouse.click(point.x, point.y, { button: action.button ?? "left" });
        await page.waitForTimeout(400);
        break;
      }
      case "double_click":
        session.pointer = { x: action.x ?? 0, y: action.y ?? 0 };
        await page.mouse.dblclick(action.x ?? 0, action.y ?? 0);
        await page.waitForTimeout(400);
        break;
      case "scroll":
        await page.mouse.move(action.x ?? 640, action.y ?? 360);
        await page.mouse.wheel(action.scroll_x ?? 0, action.scroll_y ?? 600);
        break;
      case "type":
        await page.keyboard.type(action.text ?? "", { delay: 18 });
        break;
      case "keypress":
        for (const key of action.keys ?? []) await page.keyboard.press(key);
        break;
      case "drag": {
        const path = action.path ?? [];
        if (!path.length) break;
        await page.mouse.move(path[0].x, path[0].y);
        await page.mouse.down();
        for (const p of path.slice(1)) await page.mouse.move(p.x, p.y);
        await page.mouse.up();
        break;
      }
      case "navigate": {
        const safe = isSafePublicUrl(action.url ?? "", { allowPreviewFixtures: true });
        if (!safe.ok) return { ok: false, decision: "DENY", error: safe.error };
        await page.goto(safe.url.toString(), { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(500);
        break;
      }
      case "search": {
        const q = encodeURIComponent(action.text ?? "");
        await page.goto(`https://duckduckgo.com/?q=${q}`, { waitUntil: "domcontentloaded", timeout: 25_000 });
        await page.waitForTimeout(600);
        break;
      }
      case "fill":
        await fillLabeled(page, session, action);
        break;
      case "upload": {
        const file = safeSessionFilename(action.filename);
        if (!file.ok) return { ok: false, decision: "DENY", error: file.error };
        const full = join(session.uploadsDir, file.name);
        if (!full.startsWith(session.uploadsDir) || !existsSync(full)) {
          return { ok: false, decision: "DENY", error: "Upload is not in this session folder" };
        }
        const locator = action.selector
          ? page.locator(action.selector)
          : page.locator('input[type="file"]');
        if ((await locator.count()) === 0) {
          return { ok: false, decision: "DENY", error: "No file input on this page" };
        }
        await locator.first().setInputFiles(full);
        break;
      }
      case "download": {
        const label = action.text?.trim();
        if (label) {
          const point = resolveClick(session, { type: "click", text: label });
          if (!point) return { ok: false, decision: "DENY", error: "No download control matching that label" };
          session.pointer = point;
          await page.mouse.click(point.x, point.y);
          await page.waitForTimeout(800);
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Action failed";
    pushEvent(session, actor, "error", message.slice(0, 180));
    await refresh(session);
    return { ok: false, decision: "ALLOW", error: message, snapshot: session.snapshot ?? undefined, artifacts: session.artifacts };
  }

  session.lastAction = action.type;
  pushEvent(session, actor, action.type, summarize(action));
  await refresh(session);

  if (actor === "agent" && session.snapshot?.suspicious.length) {
    const reason = session.snapshot.suspicious[0];
    requestHandoff(session, reason, `Page requires human: ${reason}`);
    return {
      ok: true,
      decision: "HUMAN_REQUIRED",
      handoffReason: reason,
      snapshot: session.snapshot,
      screenshotJpeg: session.screenshotJpeg ?? undefined,
      artifacts: session.artifacts,
      note: "Paused. Same Chrome session is waiting for you.",
    };
  }

  return {
    ok: true,
    decision: "ALLOW",
    snapshot: session.snapshot ?? undefined,
    screenshotJpeg: session.screenshotJpeg ?? undefined,
    artifacts: session.artifacts,
  };
}

function summarize(action: ComputerAction): string {
  if (action.type === "navigate") return action.url ?? "navigate";
  if (action.type === "search") return `search "${action.text}"`;
  if (action.type === "click") return action.text ? `click "${action.text}"` : `click ${action.x},${action.y}`;
  if (action.type === "type") return `type ${(action.text ?? "").slice(0, 40)}`;
  if (action.type === "fill") return `fill ${action.field ?? action.selector ?? "field"}`;
  if (action.type === "upload") return `upload ${action.filename}`;
  if (action.type === "scroll") return `scroll ${action.scroll_y ?? 0}`;
  return action.type;
}

export async function setControlOwner(owner: ControlOwner): Promise<PublicSession> {
  const session = activeId ? sessions.get(activeId) : undefined;
  if (!session) throw new Error("No computer session");
  session.controlOwner = owner;
  session.status = owner === "HUMAN" ? "HUMAN_ACTIVE" : owner === "AGENT" ? "AGENT_RUNNING" : "READY";
  if (owner === "AGENT") session.handoffReason = null;
  pushEvent(session, owner === "HUMAN" ? "human" : "agent", "lease", `control_owner=${owner}`);
  await refresh(session);
  return toPublic(session);
}

export async function takeOver(): Promise<PublicSession> {
  const session = activeId ? sessions.get(activeId) : undefined;
  if (!session) throw new Error("No computer session");
  session.controlOwner = "HUMAN";
  session.status = "HUMAN_ACTIVE";
  session.handoffReason = session.handoffReason ?? "manual";
  pushEvent(session, "human", "takeover", "Operator took the same Chrome session");
  await refresh(session);
  return toPublic(session);
}

export function stageUpload(filename: string, bytes: Buffer): SessionArtifact {
  const session = activeId ? sessions.get(activeId) : undefined;
  if (!session) throw new Error("No computer session");
  const file = safeSessionFilename(filename);
  if (!file.ok) throw new Error(file.error);
  const dest = join(session.uploadsDir, file.name);
  writeFileSync(dest, bytes);
  const artifact: SessionArtifact = { name: file.name, kind: "upload", bytes: bytes.length };
  session.artifacts.unshift(artifact);
  pushEvent(session, "human", "upload", file.name);
  return artifact;
}

export async function resetSession(): Promise<PublicSession> {
  const existing = activeId ? sessions.get(activeId) : undefined;
  if (existing) {
    await existing.context?.close().catch(() => undefined);
    await existing.browser?.close().catch(() => undefined);
    sessions.delete(existing.id);
  }
  activeId = null;
  return ensureSession();
}

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Fingerprint,
  Hammer,
  Loader2,
  Plus,
  RefreshCw,
  ScanSearch,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";

type StealthMode = "off" | "coherence" | "lab";
type Finding = { signal: string; weight: number; explanation: string };
type FingerprintData = {
  userAgent: string;
  webdriver: boolean | undefined;
  platform: string;
  hardwareConcurrency: number | null;
  deviceMemory: number | null;
  timezone: string;
  webgl: { renderer: string; unmaskedRenderer: string | null } | null;
};
type Session = {
  id: string;
  status: string;
  url: string;
  title: string;
  stealth: StealthMode;
  cookieCount: number;
  screenshotJpeg: string | null;
  cdpHttp: string | null;
  handoffReason: string | null;
  probe: {
    ok: boolean;
    fingerprint: FingerprintData | null;
    detector: { score: number; findings: Finding[]; note: string };
  } | null;
  scrape: { ok: boolean; title: string | null; markdown: string; links: Array<{ text: string; url: string }>; error?: string } | null;
};

const DOES_NOT = [
  "Farm CAPTCHAs or inject solver tokens",
  "Rotate residential proxies to evade blocks",
  "Claim an undetectable browser",
  "Rewrite navigator.webdriver",
  "Click third-party puzzle tiles",
];

type Props = {
  variant?: "page" | "pane";
  drivenByClaw?: boolean;
  onClose?: () => void;
};

export function ForgeConsole({ variant = "page", drivenByClaw = true, onClose }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stealth, setStealth] = useState<StealthMode>("coherence");
  const [url, setUrl] = useState("/fixtures/probe.html");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? sessions[0] ?? null,
    [sessions, activeId],
  );

  async function call(op: string, extra: Record<string, unknown> = {}) {
    const res = await fetch("/api/forge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, ...extra }),
    });
    const body = await res.json();
    if (body.session) {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== body.session.id);
        next.unshift(body.session);
        return next;
      });
      setActiveId(body.session.id);
    }
    if (Array.isArray(body.sessions)) setSessions(body.sessions);
    if (body.error && body.ok === false) setError(body.error);
    else if (body.ok !== false) setError(null);
    return body;
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/forge")
      .then((r) => r.json())
      .then((b) => {
        if (!alive) return;
        if (Array.isArray(b.sessions)) {
          setSessions(b.sessions);
          if (b.sessions[0]) setActiveId(b.sessions[0].id);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "status failed"));
    const t = setInterval(() => {
      fetch("/api/forge")
        .then((r) => r.json())
        .then((b) => {
          if (alive && Array.isArray(b.sessions)) setSessions(b.sessions);
        })
        .catch(() => undefined);
    }, 2200);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : label + " failed");
    } finally {
      setBusy(null);
    }
  }

  const findings = active?.probe?.detector.findings ?? [];
  const fp = active?.probe?.fingerprint;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-background text-foreground dark:border-[rgba(180,180,255,0.12)] dark:bg-[rgba(8,8,18,0.92)]">
      <div className="border-b border-border px-4 py-3 dark:border-[rgba(180,180,255,0.10)]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-9 w-9 place-items-center rounded-lg bg-muted text-foreground dark:bg-[rgba(255,255,255,0.06)] dark:text-[var(--claw-accent)]">
            <Hammer className="h-4 w-4" strokeWidth={1.7} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-tight">Claw Forge</p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              {drivenByClaw
                ? "Live view of the Forge agent Claw built. Talk in chat — do not click New session."
                : "Self-hosted Chromium control plane: sessions, persistent profile, loopback CDP, scrape, fingerprint lab. Not a CAPTCHA farm."}
            </p>
          </div>
          {variant === "pane" && onClose && (
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground" onClick={onClose} aria-label="Close forge">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {drivenByClaw ? (
        <div className="border-b border-border px-4 py-3 text-[12px] leading-relaxed text-muted-foreground dark:border-[rgba(180,180,255,0.10)]">
          Claw chooses Forge, builds the Chromium session, and tasks probe or scrape. This pane is the live frame.
        </div>
      ) : (
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 dark:border-[rgba(180,180,255,0.10)]">
        {(["coherence", "lab", "off"] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`h-11 rounded-full border px-3 text-[12px] ${
              stealth === mode
                ? "border-foreground bg-muted text-foreground dark:border-[var(--claw-accent)] dark:bg-[rgba(255,255,255,0.08)]"
                : "border-border text-muted-foreground"
            }`}
            onClick={() => setStealth(mode)}
          >
            {mode}
          </button>
        ))}
        <button
          type="button"
          className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[12px] font-medium text-background dark:bg-[var(--claw-accent)] dark:text-[#0a0a0b]"
          disabled={Boolean(busy)}
          onClick={() => void run("create", async () => { await call("create", { stealth, persist: true }); })}
        >
          {busy === "create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          New session
        </button>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px]"
          disabled={!active || Boolean(busy)}
          onClick={() =>
            void run("probe", async () => {
              if (!active) return;
              await call("probe", { sessionId: active.id, url: `${origin}/fixtures/probe.html` });
            })
          }
        >
          {busy === "probe" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />}
          Probe lab
        </button>
        <button
          type="button"
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-[12px]"
          disabled={Boolean(busy)}
          onClick={() =>
            void run("scrape", async () => {
              await call("scrape", { url: "https://example.com", sessionId: active?.id, screenshot: true });
            })
          }
        >
          {busy === "scrape" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
          Scrape example.com
        </button>
      </div>
      )}

      <div className="flex gap-2 overflow-x-auto border-b border-border px-4 py-2 dark:border-[rgba(180,180,255,0.08)]">
        {sessions.length === 0 && (
          <p className="py-2 text-[12px] text-muted-foreground">
            {drivenByClaw ? "Waiting for Claw to dispatch Forge." : "No live sessions. Create one to boot Chromium."}
          </p>
        )}
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveId(s.id)}
            className={`min-w-[160px] rounded-xl border px-3 py-2 text-left ${
              s.id === active?.id ? "border-foreground bg-muted dark:border-[var(--claw-accent)]" : "border-border"
            }`}
          >
            <p className="font-mono text-[10px] text-muted-foreground">{s.id.slice(0, 8)}</p>
            <p className="truncate text-[12px]">{s.title || "Forge"}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {s.status} · {s.stealth} · {s.cookieCount} cookies
            </p>
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
        <div className="flex min-h-0 flex-col">
          {drivenByClaw ? (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted-foreground">{active?.url || "about:blank"}</p>
              <button
                type="button"
                aria-label="Refresh frame"
                className="grid h-11 w-11 place-items-center rounded-md border border-border"
                disabled={!active || Boolean(busy)}
                onClick={() => void run("shot", async () => { if (active) await call("screenshot", { id: active.id }); })}
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          ) : (
          <form
            className="flex items-center gap-2 border-b border-border px-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!active) return;
              const target = /^https?:\/\//i.test(url) || url.startsWith("/") ? url : `https://${url}`;
              const absolute = url.startsWith("/") ? `${origin}${url}` : target;
              void run("open", async () => { await call("navigate", { id: active.id, url: absolute }); });
            }}
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className="h-11 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-[12px]"
            />
            <button type="submit" className="h-11 rounded-md border border-border px-3 text-[12px]" disabled={!active || Boolean(busy)}>
              Open
            </button>
            <button
              type="button"
              aria-label="Refresh frame"
              className="grid h-11 w-11 place-items-center rounded-md border border-border"
              disabled={!active || Boolean(busy)}
              onClick={() => void run("shot", async () => { if (active) await call("screenshot", { id: active.id }); })}
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Release session"
              className="grid h-11 w-11 place-items-center rounded-md border border-border"
              disabled={!active || Boolean(busy)}
              onClick={() => void run("kill", async () => { if (active) await call("release", { id: active.id }); })}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </form>
          )}
          <div className="relative min-h-[220px] bg-muted dark:bg-[rgba(5,5,15,0.8)]">
            {active?.screenshotJpeg ? (
              <div className="relative w-full" style={{ aspectRatio: "1280 / 800" }}>
                <img
                  src={`data:image/jpeg;base64,${active.screenshotJpeg}`}
                  alt={active.title || "Forge session"}
                  className="absolute inset-0 h-full w-full object-fill"
                />
              </div>
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                {drivenByClaw ? "Ask Claw in chat. The Chromium frame appears when Claw tasks Forge." : "Create a session to see the Chromium frame."}
              </p>
            )}
            {active?.handoffReason && (
              <div className="absolute inset-x-3 top-3 rounded-lg border border-amber-400/40 bg-background/90 px-3 py-2 text-sm text-amber-700 dark:text-[#d6b56d]">
                Paused: {active.handoffReason}. Forge will not click puzzle tiles. Solve it yourself or skip with Steel Cloud.
              </div>
            )}
          </div>
        </div>
        <aside className="flex min-h-0 flex-col border-t border-border md:border-l md:border-t-0">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-medium">Fingerprint lab</p>
            <p className="text-[12px] text-muted-foreground">Signals a defender would actually see.</p>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {error && <p className="text-sm text-red-600 dark:text-[#c47a72]">{error}</p>}
            {active && (
              <div className="rounded-xl border border-border p-3">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Session</p>
                <p className="mt-1 truncate text-[12px]">{active.url || "about:blank"}</p>
                <p className="mt-2 font-mono text-[11px] text-muted-foreground">CDP {active.cdpHttp || "pending"} · loopback only</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{active.cookieCount} cookies in persistent profile</p>
              </div>
            )}
            <div className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-medium">Anomaly score</p>
                <p className="font-mono text-sm">{active?.probe ? active.probe.detector.score : "—"}</p>
              </div>
              <ul className="mt-2 space-y-2">
                {findings.map((f) => (
                  <li key={f.signal} className="text-[12px] leading-relaxed text-muted-foreground">
                    <span className="font-mono">+{f.weight} {f.signal}</span>
                    <span className="block">{f.explanation}</span>
                  </li>
                ))}
              </ul>
            </div>
            {fp && (
              <dl className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-md bg-muted px-2 py-2"><dt className="font-mono text-[10px] uppercase text-muted-foreground">webdriver</dt><dd>{String(fp.webdriver)}</dd></div>
                <div className="rounded-md bg-muted px-2 py-2"><dt className="font-mono text-[10px] uppercase text-muted-foreground">CPU</dt><dd>{String(fp.hardwareConcurrency)}</dd></div>
                <div className="rounded-md bg-muted px-2 py-2"><dt className="font-mono text-[10px] uppercase text-muted-foreground">RAM</dt><dd>{fp.deviceMemory == null ? "n/a" : String(fp.deviceMemory)}</dd></div>
                <div className="rounded-md bg-muted px-2 py-2"><dt className="font-mono text-[10px] uppercase text-muted-foreground">WebGL</dt><dd className="truncate">{fp.webgl?.unmaskedRenderer || fp.webgl?.renderer || "none"}</dd></div>
              </dl>
            )}
            <div className="rounded-xl border border-amber-400/30 bg-muted/50 p-3">
              <p className="flex items-center gap-2 text-[12px] font-medium">
                <ShieldAlert className="h-3.5 w-3.5" />
                Will not
              </p>
              <ul className="mt-2 space-y-1 text-[12px] text-muted-foreground">
                {DOES_NOT.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

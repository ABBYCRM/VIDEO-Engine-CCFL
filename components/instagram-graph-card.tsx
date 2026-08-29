"use client";
import { useCallback, useEffect, useState } from "react";
import { Bird, CircleAlert, CircleCheck, RefreshCcw, Save, Unlink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InstagramHealth = {
  configured: boolean;
  live: boolean;
  username: string | null;
  igUserId: string | null;
  followers?: number | null;
  dmEnabled?: boolean;
  error: string | null;
};

function StatusDot({ state, label }: { state: "green" | "red" | "amber" | "grey"; label?: string }) {
  const color = state === "green" ? "#22c55e" : state === "red" ? "#ef4444" : state === "amber" ? "#f59e0b" : "#94a3b8";
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

/**
 * Instagram Graph credential card — ported here from the retired
 * Integrations page (2026-08-27 surface simplification redirected
 * /integrations to /calendar). That redirect had an unintended side
 * effect: it also removed the only UI that could ever save/rotate the
 * Graph access token, business account id, or app secret, or toggle DMs —
 * config that has nothing to do with the pages that were actually meant
 * to be hidden (Avatars/Campaigns/Pipeline/Sites). Everything below calls
 * the same, untouched /api/integrations/instagram route the old
 * Integrations page used.
 */
export function InstagramGraphCard() {
  const [instagram, setInstagram] = useState<InstagramHealth | null>(null);
  const [igToken, setIgToken] = useState("");
  const [igUserId, setIgUserId] = useState("");
  const [igSecret, setIgSecret] = useState("");
  const [flash, setFlash] = useState<{ level: "success" | "failed"; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const r = await fetch("/api/integrations/instagram");
    if (r.ok) {
      const d = await r.json();
      setInstagram(d);
      if (d.igUserId) setIgUserId((prev) => prev || d.igUserId);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  async function saveInstagram() {
    setBusy(true);
    try {
      const r = await fetch("/api/integrations/instagram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessToken: igToken || undefined,
          igUserId: igUserId || undefined,
          appSecret: igSecret || undefined,
          dmEnabled: instagram?.dmEnabled
        })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      setIgToken("");
      setIgSecret("");
      setFlash({ level: d.live ? "success" : "failed", msg: d.live ? `Instagram live as @${d.username}` : (d.error || "Saved but live check failed") });
      await reload();
    } catch (e) {
      setFlash({ level: "failed", msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function disconnectInstagram() {
    if (!confirm("Disconnect the Instagram Graph connector? Calendar auto-post will stop until you save a token again.")) return;
    setBusy(true);
    try {
      await fetch("/api/integrations/instagram", { method: "DELETE" });
      setIgUserId("");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const igState: "green" | "red" | "amber" | "grey" =
    instagram?.live ? "green" : instagram?.configured ? "red" : "grey";

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 font-medium">
          <Bird size={18} className="text-cyan-700" />
          Instagram Graph (instagram-mcp)
        </div>
        <StatusDot
          state={igState}
          label={instagram?.live ? `@${instagram.username || "live"}` : instagram?.configured ? "configured · offline" : "not configured"}
        />
      </div>
      <p className="mb-4 text-sm text-slate-600">
        Direct Instagram Graph fallback for Reels, Stories, feed stills, comments, and DMs. Claw uses it when Composio is disconnected or errors and says so. This fallback needs a Professional account, scopes
        <code className="mx-1 rounded bg-slate-100 px-1">instagram_content_publish</code>
        <code className="mx-1 rounded bg-slate-100 px-1">instagram_manage_comments</code>
        (and <code className="rounded bg-slate-100 px-1">instagram_manage_messages</code> for DMs), plus the numeric Business Account id.
      </p>
      {flash && (
        <div className={`mb-3 flex items-start gap-2 rounded-xl border p-3 text-sm ${
          flash.level === "success" ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-800" : "border-rose-500/40 bg-rose-500/10 text-rose-600"
        }`}>
          {flash.level === "success" ? <CircleCheck size={16} className="mt-0.5" /> : <CircleAlert size={16} className="mt-0.5" />}
          <span>{flash.msg}</span>
        </div>
      )}
      {instagram?.live && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Live as <b>@{instagram.username}</b>
          {instagram.igUserId ? <> · id <code className="text-[11px]">{instagram.igUserId}</code></> : null}
          {typeof instagram.followers === "number" ? <> · {instagram.followers.toLocaleString()} followers</> : null}
        </div>
      )}
      {instagram?.configured && !instagram.live && instagram.error && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{instagram.error}</div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-slate-700">Long-lived access token</span>
          <Input type="password" value={igToken} onChange={(e) => setIgToken(e.target.value)} placeholder={instagram?.configured ? "•••••• paste to replace" : "EAA…"} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium text-slate-700">Instagram Business Account id</span>
          <Input value={igUserId} onChange={(e) => setIgUserId(e.target.value)} placeholder="178414…" />
        </label>
        <label className="grid gap-1.5 text-sm md:col-span-2">
          <span className="font-medium text-slate-700">App secret (optional · enables appsecret_proof)</span>
          <Input type="password" value={igSecret} onChange={(e) => setIgSecret(e.target.value)} placeholder="paste only to set or replace" />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(instagram?.dmEnabled)}
          onChange={async (e) => {
            await fetch("/api/integrations/instagram", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ dmEnabled: e.target.checked })
            });
            await reload();
          }}
        />
        Enable DMs on the direct Graph fallback (only after Meta grants <code className="rounded bg-slate-100 px-1">instagram_manage_messages</code>)
      </label>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={saveInstagram} disabled={busy || (!igToken && !igUserId && !igSecret)}>
          {busy ? <RefreshCcw size={14} className="mr-1 animate-spin" /> : <Save size={14} className="mr-1" />}
          Save + test
        </Button>
        {instagram?.configured && (
          <Button variant="danger" onClick={disconnectInstagram} disabled={busy}>
            <Unlink size={14} className="mr-1" />Disconnect
          </Button>
        )}
      </div>
    </Card>
  );
}

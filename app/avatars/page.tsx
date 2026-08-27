"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ImageOff, Plus, RefreshCcw, RotateCcw, ShieldCheck, Sparkles, Trash2, Upload, Users, Wand2, X, UserRound, Mic2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";

type ViewKey = "front" | "left" | "right" | "back";
type ImageProvider = "hedra" | "gemini" | "openai" | "xai" | "a2e" | "nvidia" | "mock";
const VIEWS: ViewKey[] = ["front", "left", "right", "back"];

type AvatarViewStatus = {
  file: string | null;
  status: "ready" | "missing";
  generationStatus: "idle" | "generating" | "ready" | "failed";
  generationModel: string | null;
  generationError: string | null;
};

type Avatar = {
  id: string;
  name: string;
  gender: "male" | "female" | "non-binary";
  archetype: string;
  wardrobeStandard: string;
  notes: string;
  referenceImage: string | null;
  referenceImageNote: string | null;
  wardrobeRegenerationPrompt: string | null;
  status: "draft" | "ready" | "archived";
  turnaroundStatus: "draft" | "generating" | "incomplete" | "ready" | "failed";
  turnaroundModel: string | null;
  turnaroundError: string | null;
  a2eTwinId: string | null;
  a2eTwinAnchorId: string | null;
  a2eTwinStatus: "idle" | "training" | "ready" | "failed";
  a2eTwinError: string | null;
  a2eTwinStartedAt: string | null;
  a2eTwinFinishedAt: string | null;
  views: Record<ViewKey, AvatarViewStatus>;
};

type ProviderChoice = {
  id: ImageProvider;
  label: string;
  envVar: string | null;
  help: string;
  models: string[];
  supportsTurnaround: boolean;
};

type ImageSettings = {
  configured: boolean;
  provider: ImageProvider;
  model: string;
  providers: ProviderChoice[];
  modelChoices: string[];
};

function assetUrl(avatarId: string, kind: "reference" | ViewKey) {
  return `/api/admin/avatars/${avatarId}/asset?view=${kind}`;
}

function wardrobeNeedsRegeneration(a: Avatar) {
  if (a.gender !== "female") return false;
  return Boolean(a.wardrobeRegenerationPrompt) || /beach|swimwear|bikini|lingerie/i.test(`${a.wardrobeStandard} ${a.notes}`);
}

function friendlyError(message?: string | null) {
  if (!message) return null;
  const lower = message.toLowerCase();
  if (lower.includes("spending cap") || (lower.includes("gemini") && lower.includes("429"))) {
    return "Gemini image generation is blocked by the project spending cap. Raise the Gemini cap, switch the turnaround provider, or upload the four views manually.";
  }
  if (lower.includes("watchdog") || lower.includes("no progress") || lower.includes("timeout")) {
    return "Image generation stopped because the upstream model did not make progress. Clear the failed state and retry, switch providers, or upload that view manually.";
  }
  if (lower.includes("xai") && lower.includes("does not support")) {
    return "xAI can create a fresh portrait, but it cannot preserve a supplied identity through the four-view edit workflow. Use Gemini/OpenAI for turnaround editing or upload the views manually.";
  }
  return message.length > 240 ? `${message.slice(0, 240)}…` : message;
}

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [imageSettings, setImageSettings] = useState<ImageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [avatarsResponse, settingsResponse] = await Promise.all([
        fetch("/api/admin/avatars", { cache: "no-store" }),
        fetch("/api/admin/avatars/image-settings", { cache: "no-store" })
      ]);
      const avatarData = await avatarsResponse.json();
      if (!avatarsResponse.ok) throw new Error(avatarData.error || `HTTP ${avatarsResponse.status}`);
      setAvatars(avatarData.avatars || []);
      if (settingsResponse.ok) setImageSettings(await settingsResponse.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const generating = avatars.some(a =>
      a.a2eTwinStatus === "training" ||
      a.turnaroundStatus === "generating" ||
      VIEWS.some(v => a.views[v]?.generationStatus === "generating")
    );
    if (!generating) return;
    const timer = setInterval(async () => {
      await Promise.all(avatars.filter(a => a.a2eTwinStatus === "training").map(a => fetch(`/api/admin/avatars/${encodeURIComponent(a.id)}/a2e-twin`, { cache: "no-store" }).catch(() => null)));
      await load();
    }, 3500);
    return () => clearInterval(timer);
  }, [avatars, load]);

  const currentProvider = imageSettings?.providers?.find(p => p.id === imageSettings.provider);
  const canTurnaround = Boolean(imageSettings?.configured && currentProvider?.supportsTurnaround);

  async function upload(avatarId: string, kind: "reference" | ViewKey, file?: File) {
    if (!file) return;
    setBusy(`${avatarId}:${kind}`);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind === "reference" ? "reference" : "view");
      if (kind !== "reference") form.append("view", kind);
      const r = await fetch(`/api/admin/avatars/${avatarId}/upload`, { method: "POST", body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function generateAll(avatar: Avatar) {
    if (!imageSettings?.configured) { setSettingsOpen(true); return; }
    if (!currentProvider?.supportsTurnaround) {
      setError(`${currentProvider?.label || imageSettings.provider} is not an identity-preserving turnaround provider. Choose Gemini/OpenAI or upload the views manually.`);
      return;
    }
    if (!avatar.referenceImage) { setError("Upload a reference identity first."); return; }
    if (!confirm(`Generate front / left / right / back for ${avatar.name}?`)) return;
    setBusy(`${avatar.id}:all`);
    setError(null);
    try {
      const r = await fetch(`/api/admin/avatars/${avatar.id}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function regenerate(avatar: Avatar, view: ViewKey) {
    if (!canTurnaround) { setSettingsOpen(true); return; }
    setBusy(`${avatar.id}:${view}:ai`);
    setError(null);
    try {
      const r = await fetch(`/api/admin/avatars/${avatar.id}/generate-view`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ view })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function resetFailures(avatar: Avatar) {
    setBusy(`${avatar.id}:reset`);
    setError(null);
    try {
      const r = await fetch(`/api/admin/avatars/${avatar.id}/reset?all=true`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function trainTwin(avatar: Avatar) {
    if (wardrobeNeedsRegeneration(avatar) && avatar.views.front?.status !== "ready") {
      setError(`${avatar.name} needs a campaign-safe canonical front view before A2E Video Twin training.`);
      return;
    }
    if (avatar.a2eTwinStatus === "ready" && !confirm(`Retrain the A2E Video Twin for ${avatar.name}? The new training will replace the selected twin used by Create.`)) return;
    setBusy(`${avatar.id}:twin`);
    setError(null);
    try {
      const r = await fetch(`/api/admin/avatars/${encodeURIComponent(avatar.id)}/a2e-twin`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(avatar: Avatar) {
    if (!confirm(`Delete ${avatar.name}?`)) return;
    setBusy(`${avatar.id}:delete`);
    try {
      const r = await fetch(`/api/admin/avatars/${avatar.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const hasGeminiCapFailure = useMemo(() => avatars.some(a => {
    const messages = [a.turnaroundError, ...VIEWS.map(v => a.views[v]?.generationError)].filter(Boolean).join(" ").toLowerCase();
    return messages.includes("spending cap") || (messages.includes("gemini") && messages.includes("429"));
  }), [avatars]);

  return <AuthGuard><AppShell><main>
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-700"><Users size={16}/> Canonical identities</div>
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-slate-900">Avatars</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">One identity per spokesperson. Reference photo first, then four canonical views used across campaign production. A campaign-safe front view can also train a reusable A2E Video Twin.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={load} disabled={loading}><RefreshCcw size={14} className={`mr-2 ${loading ? "animate-spin" : ""}`}/>Refresh</Button>
        <Button variant="secondary" onClick={() => setSettingsOpen(true)}><Sparkles size={14} className="mr-2"/>Image: {imageSettings ? `${imageSettings.provider} · ${imageSettings.model}` : "settings"}</Button>
        <Button onClick={() => setCreateOpen(true)}><Plus size={14} className="mr-2"/>New avatar</Button>
      </div>
    </div>

    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <strong>Wardrobe rule.</strong> The default female spokesperson never uses beachwear in the canonical turnaround. Lifestyle/beach imagery may identify the person, but campaign-ready views and Video Twin training must use regenerated professional wardrobe.
    </div>

    {hasGeminiCapFailure && <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div><div className="font-semibold text-rose-900">Gemini spending cap reached</div><div className="mt-1 text-sm text-rose-700">The failure is upstream billing, not the avatar. Switch the turnaround provider, raise the Gemini cap, or upload views manually.</div></div>
      <Button variant="secondary" onClick={() => setSettingsOpen(true)}>Change image provider</Button>
    </div>}

    {error && <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{friendlyError(error)}</div>}

    <div className="mb-4 flex items-center justify-between text-sm text-slate-500"><span>{loading ? "Loading…" : `${avatars.length} avatar${avatars.length === 1 ? "" : "s"}`}</span><span>{currentProvider ? `${currentProvider.label}${currentProvider.supportsTurnaround ? " · turnaround ready" : " · portrait only"}` : "No image provider"}</span></div>

    <div className="grid gap-6 xl:grid-cols-2">
      {avatars.map(avatar => <AvatarCard key={avatar.id} avatar={avatar} canTurnaround={canTurnaround} busy={busy} onUpload={upload} onGenerateAll={generateAll} onGenerateView={regenerate} onReset={resetFailures} onTrainTwin={trainTwin} onDelete={remove}/>) }
    </div>

    {!loading && avatars.length === 0 && <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-center text-sm text-slate-500">No avatars are stored yet.</div>}

    {settingsOpen && <ImageSettingsModal initial={imageSettings} onClose={() => setSettingsOpen(false)} onSaved={s => { setImageSettings(s); setSettingsOpen(false); load(); }}/>} 

    {createOpen && <CreateAvatarModal onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }}/>}
  </main></AppShell></AuthGuard>;
}

// ────────────────────────────────────────────────────────────────────────────────
// Create-avatar modal
// 1. Operator fills name + gender + archetype + wardrobe standard + notes
// 2. (optional) Uploads an identity photo
// 3. We POST /api/admin/avatars to create the row (status=draft)
// 4. If a photo was chosen, we POST /api/admin/avatars/[id]/upload kind=reference
// 5. Reload the list — the new avatar appears as a draft with 0/4 views
// ────────────────────────────────────────────────────────────────────────────────
function CreateAvatarModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "non-binary">("male");
  const [archetype, setArchetype] = useState("");
  const [wardrobeStandard, setWardrobeStandard] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function autoId() {
    const base = (id || name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (base) setId(`${base}-${Math.random().toString(36).slice(2, 6)}`);
  }

  async function submit() {
    setErr(null);
    if (!name.trim() || !archetype.trim() || !wardrobeStandard.trim() || !id.trim()) {
      setErr("Id, name, archetype, and wardrobe standard are required.");
      return;
    }
    if (!/^[a-z0-9-]{2,40}$/.test(id)) {
      setErr("Id must be lowercase letters, numbers, and hyphens only (2-40 chars).");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/avatars", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, name, gender, archetype, wardrobeStandard, notes })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);

      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("kind", "reference");
        const up = await fetch(`/api/admin/avatars/${encodeURIComponent(id)}/upload`, { method: "POST", body: form });
        const ud = await up.json();
        if (!up.ok) throw new Error(`Created avatar, but reference upload failed: ${ud.error || `HTTP ${up.status}`}`);
      }
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-base font-semibold text-slate-900">New canonical avatar</div>
            <div className="mt-0.5 text-xs text-slate-500">A reusable identity. Pick a clear front-facing photo for the reference; the four canonical views can be generated after creation.</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X size={16} /></button>
        </div>

        <div className="max-h-[80vh] space-y-3 overflow-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">ID (URL slug, lowercase)</span>
              <input value={id} onChange={e => setId(e.target.value)} onBlur={autoId} placeholder="e.g. male-attorney-02" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Display name</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Male Attorney 02" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Gender</span>
              <select value={gender} onChange={e => setGender(e.target.value as any)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm">
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="non-binary">Non-binary</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-700">Archetype</span>
              <input value={archetype} onChange={e => setArchetype(e.target.value)} placeholder="e.g. law-firm principal" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Wardrobe standard</span>
            <input value={wardrobeStandard} onChange={e => setWardrobeStandard(e.target.value)} placeholder="e.g. navy suit, white shirt, muted gold tie" className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
            <span className="text-[11px] text-slate-500">What the avatar is canonically wearing in the four campaign views. Drives the prompt when generating turns.</span>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Notes (optional)</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="e.g. New cartoon-style male attorney, light-skinned, brown hair, ~35yo." className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          </label>

          <div className="grid gap-1 text-sm">
            <span className="font-medium text-slate-700">Reference photo (optional)</span>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setFile(e.target.files?.[0] || null)} className="hidden" />
            <button onClick={() => inputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600 hover:bg-slate-100">
              <Upload size={14} /> {file ? file.name : "Click to upload identity photo"}
            </button>
            {file && <span className="text-[11px] text-emerald-700">Will upload as identity reference after creation. You can change this later from the avatar card.</span>}
          </div>

          {err && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{err}</div>}
        </div>

        <div className="sticky bottom-0 -mx-5 mt-5 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create avatar"}</Button>
        </div>
      </div>
    </div>
  );
}

function AvatarCard({ avatar, canTurnaround, busy, onUpload, onGenerateAll, onGenerateView, onReset, onTrainTwin, onDelete }: {
  avatar: Avatar;
  canTurnaround: boolean;
  busy: string | null;
  onUpload: (id: string, kind: "reference" | ViewKey, file?: File) => Promise<void>;
  onGenerateAll: (avatar: Avatar) => Promise<void>;
  onGenerateView: (avatar: Avatar, view: ViewKey) => Promise<void>;
  onReset: (avatar: Avatar) => Promise<void>;
  onTrainTwin: (avatar: Avatar) => Promise<void>;
  onDelete: (avatar: Avatar) => Promise<void>;
}) {
  const referenceInput = useRef<HTMLInputElement>(null);
  const viewInputs = useRef<Record<ViewKey, HTMLInputElement | null>>({ front:null,left:null,right:null,back:null });
  const readyCount = VIEWS.filter(v => avatar.views[v]?.status === "ready").length;
  const failedCount = VIEWS.filter(v => avatar.views[v]?.generationStatus === "failed").length;
  const generatingCount = VIEWS.filter(v => avatar.views[v]?.generationStatus === "generating").length;
  const generating = generatingCount > 0 || avatar.turnaroundStatus === "generating";
  const warning = wardrobeNeedsRegeneration(avatar);
  const twinSourceReady = avatar.views.front?.status === "ready" || (!warning && Boolean(avatar.referenceImage));
  const twinBusy = busy === `${avatar.id}:twin` || avatar.a2eTwinStatus === "training";

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div><div className="font-semibold text-slate-900">{avatar.name}</div><div className="text-xs text-slate-500">{avatar.archetype} · {avatar.gender}</div></div>
      <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${readyCount === 4 ? "bg-emerald-50 text-emerald-700" : generating ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{readyCount === 4 ? "ready" : generating ? "generating" : "draft"}</span><button onClick={() => onDelete(avatar)} disabled={busy === `${avatar.id}:delete`} aria-label={`Delete ${avatar.name}`} className="grid h-8 w-8 place-items-center rounded-lg text-rose-500 hover:bg-rose-50"><Trash2 size={14}/></button></div>
    </div>

    {warning && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><div className="flex gap-2"><ShieldCheck size={14} className="shrink-0"/><div><strong>Identity only — regenerate wardrobe.</strong> Keep this person's face/hair identity, but use the professional wardrobe standard below for canonical views.</div></div></div>}

    <div className="grid gap-4 md:grid-cols-[150px_1fr]">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reference identity</div>
        {avatar.referenceImage ? <img src={assetUrl(avatar.id,"reference")} alt={`${avatar.name} identity reference`} className="aspect-[3/4] w-full rounded-xl border object-cover"/> : <div className="grid aspect-[3/4] place-items-center rounded-xl border border-dashed bg-slate-50 text-center text-xs text-slate-500"><div><ImageOff className="mx-auto mb-2"/>Missing reference</div></div>}
        <input ref={referenceInput} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { onUpload(avatar.id,"reference",e.target.files?.[0]); e.target.value=""; }}/>
        <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={() => referenceInput.current?.click()} disabled={busy === `${avatar.id}:reference`}><Upload size={13} className="mr-1"/>{avatar.referenceImage ? "Replace identity" : "Upload identity"}</Button>
      </div>
      <div>
        <dl className="grid gap-2 text-sm"><div><dt className="font-medium text-slate-900">Wardrobe standard</dt><dd className="text-slate-600">{avatar.wardrobeStandard}</dd></div><div><dt className="font-medium text-slate-900">Production notes</dt><dd className="text-slate-600">{avatar.notes}</dd></div></dl>
        <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3">
          <div className="flex gap-2 text-xs text-violet-900"><Wand2 size={14} className="shrink-0"/><span>Generate the canonical front / left / right / back set from the reference. Identity-preserving editing requires a provider that supports reference-image edits.</span></div>
          <div className="mt-3 flex flex-wrap items-center gap-2"><Button onClick={() => onGenerateAll(avatar)} disabled={!avatar.referenceImage || generating || busy === `${avatar.id}:all` || !canTurnaround}><Wand2 size={14} className="mr-1"/>Generate all 4</Button>{failedCount > 0 && <Button variant="secondary" onClick={() => onReset(avatar)} disabled={busy === `${avatar.id}:reset`}><RefreshCcw size={14} className="mr-1"/>Clear failed state</Button>}<span className="text-[11px] text-violet-700">{readyCount}/4 ready{generatingCount ? ` · ${generatingCount} generating` : ""}{failedCount ? ` · ${failedCount} failed` : ""}</span></div>
          {!canTurnaround && <div className="mt-2 text-[11px] text-amber-800">Current image provider is not configured for identity-preserving turnaround edits. Manual view uploads remain available.</div>}
          {avatar.turnaroundError && <div className="mt-2 rounded-lg border border-rose-200 bg-white p-2 text-[11px] text-rose-700">{friendlyError(avatar.turnaroundError)}</div>}
        </div>

        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
          <div className="flex items-start gap-2"><UserRound size={15} className="mt-0.5 shrink-0 text-sky-700"/><div className="flex-1"><div className="text-sm font-semibold text-sky-950">A2E Video Twin</div><div className="mt-1 text-xs text-sky-800">Train a reusable talking digital double from the campaign-safe canonical front. Create and split-screen can then animate this identity from driving audio.</div></div></div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant={avatar.a2eTwinStatus === "ready" ? "secondary" : "default"} onClick={() => onTrainTwin(avatar)} disabled={!twinSourceReady || twinBusy}><Mic2 size={13} className={`mr-1 ${avatar.a2eTwinStatus === "training" ? "animate-pulse" : ""}`}/>{avatar.a2eTwinStatus === "training" ? "Training Video Twin…" : avatar.a2eTwinStatus === "ready" ? "Retrain Video Twin" : avatar.a2eTwinStatus === "failed" ? "Retry Video Twin" : "Train A2E Video Twin"}</Button>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${avatar.a2eTwinStatus === "ready" ? "bg-emerald-100 text-emerald-700" : avatar.a2eTwinStatus === "failed" ? "bg-rose-100 text-rose-700" : avatar.a2eTwinStatus === "training" ? "bg-amber-100 text-amber-800" : "bg-white text-slate-500"}`}>{avatar.a2eTwinStatus || "idle"}</span>
          </div>
          {!twinSourceReady && <div className="mt-2 text-[11px] text-amber-800">Generate or upload the professional canonical front view before training this identity.</div>}
          {avatar.a2eTwinStatus === "ready" && <div className="mt-2 text-[11px] font-medium text-emerald-700"><Check size={11} className="mr-1 inline"/>Ready in Create as “A2E · Video Twin (trained avatar)”.</div>}
          {avatar.a2eTwinError && <div className="mt-2 rounded-lg border border-rose-200 bg-white p-2 text-[11px] text-rose-700">{friendlyError(avatar.a2eTwinError)}</div>}
        </div>
      </div>
    </div>

    <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
      {VIEWS.map(view => {
        const state = avatar.views[view];
        const failed = state?.generationStatus === "failed";
        const generatingView = state?.generationStatus === "generating";
        return <div key={view} className="rounded-xl border border-slate-200 p-2">
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase"><span>{view}</span>{state?.status === "ready" ? <span className="text-emerald-600"><Check size={10} className="inline"/> ready</span> : generatingView ? <span className="text-amber-700">generating</span> : failed ? <span className="text-rose-600">failed</span> : <span className="text-slate-400">missing</span>}</div>
          {state?.file ? <img src={assetUrl(avatar.id,view)} alt={`${avatar.name} ${view}`} className="aspect-[3/4] w-full rounded-lg object-cover"/> : <div className={`grid aspect-[3/4] place-items-center rounded-lg border border-dashed p-2 text-center text-[10px] ${failed ? "border-rose-200 bg-rose-50 text-rose-700" : generatingView ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>{failed ? friendlyError(state?.generationError) : generatingView ? "Generating…" : "Missing"}</div>}
          <div className="mt-2 grid grid-cols-2 gap-1"><button onClick={() => viewInputs.current[view]?.click()} className="rounded-md border px-1 py-1 text-[10px] hover:bg-slate-50"><Upload size={10} className="inline"/> Upload</button><button onClick={() => onGenerateView(avatar,view)} disabled={!canTurnaround || !avatar.referenceImage || generatingView || busy === `${avatar.id}:${view}:ai`} className="rounded-md border border-violet-200 bg-violet-50 px-1 py-1 text-[10px] text-violet-700 disabled:opacity-40"><RotateCcw size={10} className="inline"/> AI</button></div>
          <input ref={el => { viewInputs.current[view]=el; }} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => { onUpload(avatar.id,view,e.target.files?.[0]); e.target.value=""; }}/>
        </div>;
      })}
    </div>
  </section>;
}

function ImageSettingsModal({ initial, onClose, onSaved }: { initial: ImageSettings | null; onClose: () => void; onSaved: (settings: ImageSettings) => void }) {
  const [provider,setProvider] = useState<ImageProvider>(initial?.provider || "hedra");
  const [model,setModel] = useState(initial?.model || "gpt-image-2");
  const [apiKey,setApiKey] = useState("");
  const [choices,setChoices] = useState<ProviderChoice[]>(initial?.providers || []);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial?.providers?.length) return;
    fetch("/api/admin/avatars/image-settings").then(r => r.json()).then(d => setChoices(d.providers || [])).catch(() => {});
  }, [initial]);

  const selected = choices.find(p => p.id === provider);
  const models = selected?.models || initial?.modelChoices || [];

  function chooseProvider(choice: ProviderChoice) {
    if (!choice.supportsTurnaround && choice.id === "xai") return;
    setProvider(choice.id);
    setModel(choice.models[0] || "");
    setApiKey("");
    setError(null);
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/avatars/image-settings", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({provider,model,apiKey:apiKey || undefined}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onSaved(d);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return <div className="fixed inset-0 z-50 bg-slate-900/35 p-3 sm:p-4 overflow-y-auto" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between"><div><div className="font-semibold text-slate-900">Avatar image provider</div><div className="text-xs text-slate-500">This setting controls identity-preserving four-view generation.</div></div><button onClick={onClose} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-slate-100"><X size={16}/></button></div>
      <div className="grid gap-2">{choices.map(choice => {
        const disabled = !choice.supportsTurnaround && choice.id === "xai";
        return <button key={choice.id} type="button" disabled={disabled} onClick={() => chooseProvider(choice)} className={`rounded-xl border p-3 text-left ${provider === choice.id ? "border-violet-400 bg-violet-50" : "border-slate-200"} ${disabled ? "cursor-not-allowed opacity-55" : "hover:border-violet-300"}`}><div className="flex items-center justify-between gap-2"><div className="font-medium text-slate-900">{choice.label}</div><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${choice.supportsTurnaround ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{choice.supportsTurnaround ? "4-view" : "portrait only"}</span></div><div className="mt-1 text-xs text-slate-500">{choice.help}</div></button>;
      })}</div>
      {selected && <div className="mt-4 grid gap-3"><label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">Model</span><select value={model} onChange={e => setModel(e.target.value)} className="h-11 rounded-xl border px-3">{models.map(m => <option key={m} value={m}>{m}</option>)}</select></label>{provider !== "mock" && <label className="grid gap-1 text-sm"><span className="font-medium text-slate-700">{selected.envVar || "API key"}</span><input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={initial?.configured && initial.provider === provider ? "Saved · paste only to replace" : "Use environment variable or paste a replacement"} className="h-11 rounded-xl border px-3"/><span className="text-[11px] text-slate-500">Environment variables are preferred in production. A pasted replacement is encrypted at rest.</span></label>}</div>}
      {provider === "gemini" && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Gemini supports the turnaround workflow, but a 429 spending-cap error must be resolved in the Google AI project before retrying.</div>}
      {error && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{friendlyError(error)}</div>}
      <div className="sticky bottom-0 -mx-5 mt-5 flex justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)]"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
    </div>
  </div>;
}

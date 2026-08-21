"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Users, Upload, Trash2, RefreshCcw, ShieldCheck, ImageOff, Check, Wand2, Sparkles, Plus, X, AlertTriangle, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";

type ViewKey = "front" | "left" | "right" | "back";
const VIEWS: ViewKey[] = ["front", "left", "right", "back"];

type ViewGenStatus = "idle" | "generating" | "ready" | "failed";

type AvatarViewStatus = {
  file: string | null;
  status: "ready" | "missing";
  generationStatus: ViewGenStatus;
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
  turnaroundStartedAt: string | null;
  turnaroundFinishedAt: string | null;
  turnaroundError: string | null;
  views: Record<ViewKey, AvatarViewStatus>;
};

type ImageSettings = { configured: boolean; provider: "gemini" | "openai" | "mock"; model: string };

function assetUrl(avatarId: string, kind: "reference" | ViewKey): string {
  const v = kind === "reference" ? "reference" : kind;
  return `/api/admin/avatars/${avatarId}/asset?view=${v}`;
}

function hasIdentityOnlyBeachReference(a: Avatar): boolean {
  if (a.gender !== "female") return false;
  if (a.wardrobeRegenerationPrompt) return true;
  return /beach|swimwear|bikini|lingerie/i.test(`${a.wardrobeStandard} ${a.notes}`);
}

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [imageSettings, setImageSettings] = useState<ImageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [genBusyAvatar, setGenBusyAvatar] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState<Avatar | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/avatars", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setAvatars(d.avatars);
      // Pull image settings to know if Generate should be enabled
      const s = await fetch("/api/admin/avatars/image-settings", { cache: "no-store" });
      if (s.ok) {
        const sd = await s.json();
        setImageSettings({ configured: sd.configured, provider: sd.provider, model: sd.model });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll while any view is generating
  useEffect(() => {
    const anyGenerating = avatars.some(a => Object.values(a.views).some(v => v.generationStatus === "generating") || a.turnaroundStatus === "generating");
    if (!anyGenerating) return;
    const t = setInterval(() => { load(); }, 3500);
    return () => clearInterval(t);
  }, [avatars, load]);

  async function onUpload(avatarId: string, kind: "reference" | ViewKey, file: File) {
    setBusyId(`${avatarId}:${kind}`);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind === "reference" ? "reference" : "view");
      if (kind !== "reference") fd.append("view", kind);
      const r = await fetch(`/api/admin/avatars/${avatarId}/upload`, { method: "POST", body: fd });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(avatarId: string) {
    if (!confirm("Delete this avatar? The reference image and 4-view slots will be removed.")) return;
    setBusyId(`${avatarId}:delete`);
    try {
      const r = await fetch(`/api/admin/avatars/${avatarId}`, { method: "DELETE" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${r.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onGenerateAll(avatarId: string) {
    if (!imageSettings?.configured) {
      setError("Image API key not configured. Click the image settings (top right) to set one.");
      return;
    }
    if (!confirm("AI will generate all 4 views (front / left / right / back) from the reference identity photo. Continue?")) return;
    setGenBusyAvatar(avatarId);
    setError(null);
    try {
      const r = await fetch(`/api/admin/avatars/${avatarId}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({})
      });
      const d = await r.json();
      if (!r.ok) {
        if (d.needsImageKey) {
          setError("Image API key not configured. Open Settings → Avatars (top right) to add one.");
        } else {
          setError(d.error || `HTTP ${r.status}`);
        }
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenBusyAvatar(null);
    }
  }

  async function onGenerateView(avatarId: string, view: ViewKey) {
    if (!imageSettings?.configured) {
      setError("Image API key not configured.");
      return;
    }
    setBusyId(`${avatarId}:gen:${view}`);
    setError(null);
    try {
      const r = await fetch(`/api/admin/avatars/${avatarId}/generate-view`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ view })
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || `HTTP ${r.status}`);
        return;
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AuthGuard>
      <AppShell>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-[34px] font-semibold leading-[1.1] tracking-tight text-slate-900">Avatars</h1>
              <p className="mt-1 text-[15px] text-slate-600">Canonical identity across every campaign. Generate a 4-view turnaround from one reference photo.</p>
            </div>
            <button
              onClick={() => setShowSettings(showSettings || { id: "_", name: "Image API settings" } as Avatar)}
              className="soro-add-pill"
            >
              <Sparkles size={14} className="text-violet-600" />
              <span>{imageSettings?.configured ? `Image: ${imageSettings.provider} · ${imageSettings.model}` : "Set image API key"}</span>
            </button>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <strong>Wardrobe rule:</strong> The default female spokesperson never uses beachwear. The canonical
            campaign turnaround must use a tailored blazer / professional top / slacks. Beach / swimwear / lifestyle
            photos can serve as identity reference but are not the canonical turnaround.
          </div>
        </div>

        {showSettings && (
          <ImageSettingsModal
            initial={imageSettings}
            onClose={() => setShowSettings(null)}
            onSaved={(s) => { setImageSettings(s); setShowSettings(null); }}
          />
        )}

        <div className="mt-6 mb-2 flex items-center justify-between">
          <div className="text-sm text-slate-600">
            {loading ? "Loading…" : `${avatars.length} avatar${avatars.length === 1 ? "" : "s"}`}
          </div>
          <Button variant="secondary" onClick={load} disabled={loading}>
            <RefreshCcw size={14} className="mr-2" />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {avatars.map((avatar) => (
            <AvatarCard
              key={avatar.id}
              avatar={avatar}
              busyId={busyId}
              genBusyAvatar={genBusyAvatar}
              imageConfigured={Boolean(imageSettings?.configured)}
              onUpload={onUpload}
              onDelete={onDelete}
              onGenerateAll={onGenerateAll}
              onGenerateView={onGenerateView}
            />
          ))}
        </div>

        {avatars.length === 0 && !loading && (
          <Card title="No avatars yet">
            <p className="text-sm text-slate-600">
              Avatar CRUD is wired and persisted to SQLite. The default two seed entries should appear after
              the first request. If you see this, click <em>Refresh</em>.
            </p>
          </Card>
        )}
      </AppShell>
    </AuthGuard>
  );
}

function AvatarCard({
  avatar, busyId, genBusyAvatar, imageConfigured, onUpload, onDelete, onGenerateAll, onGenerateView
}: {
  avatar: Avatar;
  busyId: string | null;
  genBusyAvatar: string | null;
  imageConfigured: boolean;
  onUpload: (avatarId: string, kind: "reference" | ViewKey, file: File) => Promise<void>;
  onDelete: (avatarId: string) => Promise<void>;
  onGenerateAll: (avatarId: string) => Promise<void>;
  onGenerateView: (avatarId: string, view: ViewKey) => Promise<void>;
}) {
  const refInputRef = useRef<HTMLInputElement>(null);
  const viewInputRefs = useRef<Record<ViewKey, HTMLInputElement | null>>({
    front: null, left: null, right: null, back: null
  });

  const referenceReady = Boolean(avatar.referenceImage);
  const readyCount = VIEWS.filter(v => avatar.views[v]?.status === "ready").length;
  const generatingCount = VIEWS.filter(v => avatar.views[v]?.generationStatus === "generating").length;
  const failedCount = VIEWS.filter(v => avatar.views[v]?.generationStatus === "failed").length;
  const viewsReady = readyCount === VIEWS.length;
  const turnaroundReady = referenceReady && viewsReady;
  const wardrobeWarning = hasIdentityOnlyBeachReference(avatar);
  const anyGen = generatingCount > 0 || avatar.turnaroundStatus === "generating";

  return (
    <div className="soro-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="soro-icon-badge">
            <Users size={20} />
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900">{avatar.name}</div>
            <div className="text-xs text-slate-500">{avatar.archetype} · {avatar.gender}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
            turnaroundReady ? "bg-emerald-50 text-emerald-700" :
            anyGen ? "bg-amber-50 text-amber-800" :
            "bg-slate-100 text-slate-600"
          }`}>
            {turnaroundReady ? "ready" : anyGen ? "generating" : "draft"}
          </span>
          <button
            onClick={() => onDelete(avatar.id)}
            className="grid h-8 w-8 place-items-center rounded-lg bg-rose-50 text-rose-500 transition hover:bg-rose-100"
            aria-label="Delete"
            disabled={busyId === `${avatar.id}:delete`}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {wardrobeWarning && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="flex items-start gap-2">
            <ShieldCheck size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <strong>Identity reference loaded · wardrobe must be regenerated.</strong> The
              supplied photo is the identity reference only (beach environment, swimwear).
              The canonical campaign turnaround and every campaign shot must regenerate the wardrobe
              in professional attire (tailored blazer / blouse / slacks).
            </div>
          </div>
          {avatar.referenceImageNote && (
            <p className="ml-5 italic text-amber-700">{avatar.referenceImageNote}</p>
          )}
          {avatar.wardrobeRegenerationPrompt && (
            <RegenerationPromptBlock prompt={avatar.wardrobeRegenerationPrompt} />
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[160px_1fr]">
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Reference identity</div>
          {avatar.referenceImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl(avatar.id, "reference")}
              alt={`${avatar.name} identity reference`}
              className="aspect-[3/4] w-full rounded-xl border border-slate-200 object-cover"
            />
          ) : (
            <div className="grid aspect-[3/4] w-full place-items-center rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-center text-xs text-amber-800">
              <div>
                <ImageOff size={20} className="mx-auto mb-1" />
                <div className="font-semibold">Missing</div>
                <div className="mt-1 text-amber-700">Professional wardrobe identity required</div>
              </div>
            </div>
          )}
          <input
            ref={refInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(avatar.id, "reference", f);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            className="mt-2 w-full"
            disabled={busyId === `${avatar.id}:reference`}
            onClick={() => refInputRef.current?.click()}
          >
            <Upload size={14} className="mr-2" />
            {avatar.referenceImage ? "Replace identity" : "Upload identity"}
          </Button>
        </div>
        <div>
          <p className="text-sm">
            <strong className="text-slate-900">Archetype:</strong>{" "}
            <span className="text-slate-600">{avatar.archetype}</span>
          </p>
          <p className="text-sm">
            <strong className="text-slate-900">Gender:</strong>{" "}
            <span className="text-slate-600">{avatar.gender}</span>
          </p>
          <p className="text-sm">
            <strong className="text-slate-900">Wardrobe standard:</strong>{" "}
            <span className="text-slate-600">{avatar.wardrobeStandard}</span>
          </p>
          <p className="mt-2 text-sm text-slate-600">{avatar.notes}</p>

          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50 p-3">
            <div className="flex items-start gap-2 text-xs text-violet-900">
              <Wand2 size={14} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <strong>AI 4-view turnaround.</strong> Click <em>Generate all 4</em> to
                have the image model render front / left / right / back from the identity
                photo, preserving face, hair, wardrobe, and environment. The same model
                and prompt are reused on regenerate.
                {!imageConfigured && (
                  <div className="mt-1 flex items-center gap-1 text-amber-800">
                    <AlertTriangle size={11} />
                    <span>Set an image API key in the top right first.</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                onClick={() => onGenerateAll(avatar.id)}
                disabled={!imageConfigured || !referenceReady || genBusyAvatar === avatar.id || anyGen}
                className="bg-violet-600 text-white hover:bg-violet-700"
              >
                {anyGen ? (
                  <><RefreshCcw size={14} className="mr-1 animate-spin" />Generating…</>
                ) : (
                  <><Wand2 size={14} className="mr-1" />Generate all 4</>
                )}
              </Button>
              <span className="text-[11px] text-violet-700">
                {readyCount}/4 ready · {generatingCount > 0 ? `${generatingCount} generating · ` : ""}{failedCount > 0 ? `${failedCount} failed · ` : ""}{avatar.turnaroundModel ? `model ${avatar.turnaroundModel}` : ""}
              </span>
            </div>
            {avatar.turnaroundError && (
              <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-700">
                {avatar.turnaroundError}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">4-view turnaround</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">{readyCount}/4 ready</div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {VIEWS.map((view) => {
            const v = avatar.views[view];
            const genState = v?.generationStatus || "idle";
            const generating = genState === "generating";
            const failed = genState === "failed";
            return (
              <div key={view} className="rounded-xl border border-slate-200 bg-white p-2">
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                  <span>{view}</span>
                  {v?.status === "ready" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600">
                      <Check size={10} /> ready
                    </span>
                  ) : generating ? (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <RefreshCcw size={10} className="animate-spin" /> generating
                    </span>
                  ) : failed ? (
                    <span className="inline-flex items-center gap-1 text-rose-600" title={v?.generationError || "failed"}>
                      <AlertTriangle size={10} /> failed
                    </span>
                  ) : (
                    <span className="text-slate-400">missing</span>
                  )}
                </div>
                {v?.file ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(avatar.id, view)} alt={`${avatar.name} ${view} view`} className="aspect-[3/4] w-full rounded-lg border border-slate-200 object-cover" />
                ) : generating ? (
                  <div className="grid aspect-[3/4] w-full place-items-center rounded-lg border border-dashed border-amber-300 bg-amber-50">
                    <div className="flex flex-col items-center gap-1 text-amber-700">
                      <RefreshCcw size={16} className="animate-spin" />
                      <span className="text-[10px] font-medium">generating…</span>
                    </div>
                  </div>
                ) : failed ? (
                  <div className="grid aspect-[3/4] w-full place-items-center rounded-lg border border-dashed border-rose-300 bg-rose-50 p-2 text-center text-[10px] text-rose-600">
                    {v?.generationError?.slice(0, 80) || "generation failed"}
                  </div>
                ) : (
                  <div className="grid aspect-[3/4] w-full place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center text-[10px] text-slate-400">
                    missing
                  </div>
                )}
                {failed && v?.generationError && (
                  <div className="mt-1 truncate text-[10px] text-rose-500" title={v.generationError}>{v.generationError}</div>
                )}
                <div className="mt-1 flex gap-1">
                  <button
                    onClick={() => viewInputRefs.current[view]?.click()}
                    disabled={busyId === `${avatar.id}:${view}`}
                    className="flex-1 rounded-md border border-slate-200 px-1.5 py-1 text-[10px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Upload size={10} className="inline" /> Upload
                  </button>
                  <button
                    onClick={() => onGenerateView(avatar.id, view)}
                    disabled={!imageConfigured || !referenceReady || busyId === `${avatar.id}:gen:${view}` || generating}
                    className="flex-1 rounded-md border border-violet-200 bg-violet-50 px-1.5 py-1 text-[10px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                    title="Regenerate this view with the image model"
                  >
                    {busyId === `${avatar.id}:gen:${view}` ? <RefreshCcw size={10} className="inline animate-spin" /> : <RotateCcw size={10} className="inline" />} AI
                  </button>
                </div>
                <input
                  ref={(el) => { viewInputRefs.current[view] = el; }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(avatar.id, view, f);
                    e.target.value = "";
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ImageSettingsModal({
  initial, onClose, onSaved
}: {
  initial: ImageSettings | null;
  onClose: () => void;
  onSaved: (s: ImageSettings) => void;
}) {
  const [provider, setProvider] = useState<"gemini" | "openai" | "mock">(initial?.provider || "gemini");
  const [model, setModel] = useState(initial?.model || "gemini-2.0-flash-exp");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<Array<{ id: string; label: string; envVar: string | null; help: string }>>([]);
  const [modelChoices, setModelChoices] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/admin/avatars/image-settings")
      .then(r => r.json())
      .then(d => {
        setProviders(d.providers || []);
        setModelChoices(d.modelChoices || []);
      });
  }, []);

  async function save() {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/admin/avatars/image-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, model, apiKey: apiKey || undefined })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
      onSaved({ configured: d.configured, provider: d.provider, model: d.model });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const currentProvider = providers.find(p => p.id === provider);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" onClick={onClose}>
      <div className="soro-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Sparkles size={18} className="text-violet-600" />
            Image generation API
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Used by the AI 4-view turnaround generator on the Avatars page. The reference identity photo is sent
          along with a rotation prompt; the model returns a PNG that becomes the front / left / right / back view.
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Provider</label>
            <div className="grid gap-2">
              {providers.map(p => (
                <button
                  key={p.id}
                  onClick={() => setProvider(p.id as "gemini" | "openai" | "mock")}
                  className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition ${
                    provider === p.id ? "border-violet-400 bg-violet-50 ring-1 ring-violet-200" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 border-slate-300" style={provider === p.id ? { borderColor: "#6E56CF", background: "#6E56CF" } : {}}>
                    {provider === p.id && <div className="m-auto mt-0.5 h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-slate-900">{p.label}</div>
                    <div className="text-[11px] text-slate-500">{p.help}</div>
                    {p.envVar && <div className="mt-0.5 text-[10px] text-slate-400">env: <code className="rounded bg-slate-100 px-1">{p.envVar}</code></div>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Model</label>
            <select
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm soro-ring"
              value={model}
              onChange={e => setModel(e.target.value)}
            >
              {modelChoices.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          {provider !== "mock" && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {currentProvider?.envVar || "API key"}
              </label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={initial?.configured ? "•••• saved · paste to replace" : "paste API key"}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm soro-ring"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Encrypted at rest (AES-256-GCM). Not logged.
              </p>
            </div>
          )}

          {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{error}</div>}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy} className="bg-violet-600 text-white hover:bg-violet-700">
            {busy ? <><RefreshCcw size={14} className="mr-1 animate-spin" />Saving…</> : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RegenerationPromptBlock({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-5 rounded-md border border-amber-200 bg-white">
      <div className="flex items-center justify-between px-2 py-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] uppercase tracking-wide text-amber-800 hover:text-amber-900"
        >
          {open ? "▾ hide regeneration prompt" : "▸ show regeneration prompt"}
        </button>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(prompt);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {/* ignore */}
          }}
          className="rounded border border-amber-200 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-800 hover:bg-amber-100"
        >
          {copied ? "✓ copied" : "copy prompt"}
        </button>
      </div>
      {open && (
        <pre className="max-h-48 overflow-auto border-t border-amber-200 p-2 text-[10px] leading-relaxed text-amber-900">
{prompt}
        </pre>
      )}
    </div>
  );
}

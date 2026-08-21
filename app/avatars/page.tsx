"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Users, Upload, Trash2, RefreshCcw, ShieldCheck, ImageOff, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";

type ViewKey = "front" | "left" | "right" | "back";
const VIEWS: ViewKey[] = ["front", "left", "right", "back"];

type AvatarViewStatus = { file: string | null; status: "ready" | "missing" };

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
  views: Record<ViewKey, AvatarViewStatus>;
};

// The API returns the on-disk path (/avatars/<id>/<filename>). We stream those
// through /api/admin/avatars/[id]/asset?view=... because the Next.js standalone
// build bakes /public at build time and doesn't serve runtime uploads.
function assetUrl(avatarId: string, kind: "reference" | ViewKey): string {
  const v = kind === "reference" ? "reference" : kind;
  return `/api/admin/avatars/${avatarId}/asset?view=${v}`;
}

// Heuristic: wardrobe warning is shown when the avatar is female AND
//   (a) the preset flagged an explicit wardrobeRegenerationPrompt (the
//       reference is identity-only and the operator must regenerate), OR
//   (b) the wardrobe standard still mentions beach/swimwear (the supply is
//       non-canonical).
// When wardrobeRegenerationPrompt is null AND the wardrobe standard names
// professional garments, the avatar is canonical — no warning shown.
function hasIdentityOnlyBeachReference(a: Avatar): boolean {
  if (a.gender !== "female") return false;
  if (a.wardrobeRegenerationPrompt) return true;
  return /beach|swimwear|bikini|lingerie/i.test(`${a.wardrobeStandard} ${a.notes}`);
}

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/avatars", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setAvatars(d.avatars);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <Users size={24} className="text-cyan-300" />
              Avatars
            </h1>
            <p className="max-w-3xl text-slate-400">
              All campaign categories reuse the same canonical avatar identity. Before an avatar can be used,
              generate and store the required 4-view turnaround render: front, left side, right side, back.
              Click any reference slot to upload a new image — saved immediately to <code>public/avatars/&lt;id&gt;/</code>.
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
              <ShieldCheck size={14} className="text-amber-300" />
              <strong>Wardrobe rule:</strong> The default female spokesperson never uses beachwear. The canonical
              campaign turnaround must use a tailored blazer / professional top / slacks. Beach / swimwear / lifestyle
              photos can serve as identity reference but are not the canonical turnaround.
            </div>
          </div>

          <div className="mb-6 flex items-center justify-between">
            <div className="text-sm text-slate-400">
              {loading ? "Loading…" : `${avatars.length} avatar${avatars.length === 1 ? "" : "s"}`}
            </div>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCcw size={14} className="mr-2" />
              Refresh
            </Button>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {avatars.map((avatar) => (
              <AvatarCard
                key={avatar.id}
                avatar={avatar}
                busyId={busyId}
                onUpload={onUpload}
                onDelete={onDelete}
              />
            ))}
          </div>

          {avatars.length === 0 && !loading && (
            <Card title="No avatars yet">
              <p className="text-sm text-slate-400">
                Avatar CRUD is wired and persisted to SQLite. The default two seed entries should appear after
                the first request. If you see this, click <em>Refresh</em>.
              </p>
            </Card>
          )}
        </main>
      </AppShell>
    </AuthGuard>
  );
}

function AvatarCard({
  avatar,
  busyId,
  onUpload,
  onDelete
}: {
  avatar: Avatar;
  busyId: string | null;
  onUpload: (avatarId: string, kind: "reference" | ViewKey, file: File) => Promise<void>;
  onDelete: (avatarId: string) => Promise<void>;
}) {
  const refInputRef = useRef<HTMLInputElement>(null);
  const viewInputRefs = useRef<Record<ViewKey, HTMLInputElement | null>>({
    front: null, left: null, right: null, back: null
  });

  const referenceReady = Boolean(avatar.referenceImage);
  const viewsReady = VIEWS.every((v) => avatar.views[v]?.status === "ready");
  const turnaroundReady = referenceReady && viewsReady;
  const wardrobeWarning = hasIdentityOnlyBeachReference(avatar);

  return (
    <Card
      title={avatar.name}
      actions={
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
              turnaroundReady
                ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                : "border border-slate-700 bg-slate-800 text-slate-400"
            }`}
          >
            {turnaroundReady ? "ready" : "draft"}
          </span>
          <Button variant="danger" onClick={() => onDelete(avatar.id)}>
            <Trash2 size={14} />
          </Button>
        </div>
      }
    >
      {wardrobeWarning && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
          <div className="flex items-start gap-2">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-amber-300" />
            <div className="flex-1">
              <strong>Identity reference loaded · wardrobe must be regenerated.</strong> The
              supplied photo is the identity reference only (beach environment, swimwear).
              Per the project's avatar wardrobe rule, the canonical campaign turnaround and every
              campaign shot must regenerate the wardrobe in professional attire
              (tailored blazer / blouse / slacks). Hair, face geometry, and identity will
              be preserved.
            </div>
          </div>
          {avatar.referenceImageNote && (
            <p className="ml-5 text-amber-200/80 italic">{avatar.referenceImageNote}</p>
          )}
          {avatar.wardrobeRegenerationPrompt && (
            <RegenerationPromptBlock prompt={avatar.wardrobeRegenerationPrompt} />
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[160px_1fr]">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Reference identity</div>
          {avatar.referenceImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={assetUrl(avatar.id, "reference")}
              alt={`${avatar.name} identity reference`}
              className="aspect-[3/4] w-full rounded-xl border border-slate-800 object-cover"
            />
          ) : (
            <div className="grid aspect-[3/4] w-full place-items-center rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-center text-xs text-amber-200">
              <div>
                <ImageOff size={20} className="mx-auto mb-1 text-amber-300" />
                <div className="font-semibold">Missing</div>
                <div className="mt-1 text-amber-200/70">Professional wardrobe identity required</div>
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
            <strong className="text-slate-300">Archetype:</strong>{" "}
            <span className="text-slate-400">{avatar.archetype}</span>
          </p>
          <p className="text-sm">
            <strong className="text-slate-300">Gender:</strong>{" "}
            <span className="text-slate-400">{avatar.gender}</span>
          </p>
          <p className="text-sm">
            <strong className="text-slate-300">Wardrobe standard:</strong>{" "}
            <span className="text-slate-400">{avatar.wardrobeStandard}</span>
          </p>
          <p className="mt-2 text-sm text-slate-400">{avatar.notes}</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">4-view turnaround</div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500">
            {VIEWS.filter((v) => avatar.views[v]?.status === "ready").length}/4 ready
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {VIEWS.map((view) => {
            const v = avatar.views[view];
            const inputRef = (el: HTMLInputElement | null) => {
              viewInputRefs.current[view] = el;
            };
            return (
              <div
                key={view}
                className="rounded-xl border border-slate-800 bg-slate-950/40 p-2"
              >
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                  <span>{view}</span>
                  {v?.status === "ready" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <Check size={10} /> ready
                    </span>
                  ) : (
                    <span className="text-slate-500">missing</span>
                  )}
                </div>
                {v?.file ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(avatar.id, view)} alt={`${avatar.name} ${view} view`} className="aspect-[3/4] w-full rounded-lg border border-slate-800 object-cover" />
                ) : (
                  <div className="grid aspect-[3/4] w-full place-items-center rounded-lg border border-dashed border-slate-700 bg-slate-900 text-center text-[10px] text-slate-500">
                    missing
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(avatar.id, view, f);
                    e.target.value = "";
                  }}
                />
                <button
                  className="mt-1 w-full rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  disabled={busyId === `${avatar.id}:${view}`}
                  onClick={() => viewInputRefs.current[view]?.click()}
                >
                  {busyId === `${avatar.id}:${view}` ? "Uploading…" : v?.file ? "Replace" : "Upload"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function RegenerationPromptBlock({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <div className="ml-5 rounded-md border border-amber-500/30 bg-slate-950/40">
      <div className="flex items-center justify-between px-2 py-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[11px] uppercase tracking-wide text-amber-200 hover:text-amber-100"
        >
          {open ? "▾ hide regeneration prompt" : "▸ show regeneration prompt"}
        </button>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(prompt);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* ignore */
            }
          }}
          className="rounded border border-amber-500/40 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-200 hover:bg-amber-500/15"
        >
          {copied ? "✓ copied" : "copy prompt"}
        </button>
      </div>
      {open && (
        <pre className="max-h-48 overflow-auto border-t border-amber-500/20 p-2 text-[10px] leading-relaxed text-amber-100/90">
{prompt}
        </pre>
      )}
    </div>
  );
}

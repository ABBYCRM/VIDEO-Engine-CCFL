"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckSquare2,
  Download,
  Film,
  Image as ImageIcon,
  Instagram,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

type Asset = {
  id: string;
  kind: string;
  mediaType: "image" | "video";
  label: string;
  title: string;
  url: string;
  model: string | null;
  prompt: string | null;
  createdAt: string;
};

type BulkProgress = {
  completed: number;
  total: number;
};

const FILTERS = ["all", "images", "videos", "generated", "reference", "turnaround"] as const;
const MAX_BULK_ASSETS = 100;
const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024;

function safeName(asset: Asset) {
  return `${asset.title}-${asset.label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "generated-media";
}

function extensionFor(asset: Asset, contentType: string) {
  const type = contentType.toLowerCase();
  if (asset.mediaType === "video") return type.includes("webm") ? "webm" : type.includes("quicktime") ? "mov" : "mp4";
  return type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "png";
}

function uniqueArchiveName(asset: Asset, contentType: string, usedNames: Set<string>) {
  const extension = extensionFor(asset, contentType);
  const base = safeName(asset);
  let candidate = `${base}.${extension}`;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}-${suffix}.${extension}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function saveBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

async function fetchAsset(asset: Asset) {
  const response = await fetch(asset.url);
  if (!response.ok) throw new Error(`Could not download “${asset.title}” (HTTP ${response.status})`);
  return response.blob();
}

export default function LibraryPage() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [published, setPublished] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      const nextAssets = (data.assets || []) as Asset[];
      setAssets(nextAssets);
      const availableIds = new Set(nextAssets.map((asset) => asset.id));
      setSelectedIds((previous) => new Set([...previous].filter((id) => availableIds.has(id))));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return assets.filter((asset) => {
      const matchesFilter = filter === "all"
        || (filter === "images" && asset.mediaType === "image")
        || (filter === "videos" && asset.mediaType === "video")
        || asset.kind === filter;
      const searchable = `${asset.title} ${asset.label} ${asset.model || ""}`.toLowerCase();
      return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [assets, filter, query]);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.has(asset.id)),
    [assets, selectedIds]
  );
  const allVisibleSelected = visible.length > 0 && visible.every((asset) => selectedIds.has(asset.id));

  function toggleAsset(assetId: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  }

  function toggleVisible() {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) visible.forEach((asset) => next.delete(asset.id));
      else visible.forEach((asset) => next.add(asset.id));
      return next;
    });
  }

  async function download(asset: Asset) {
    setError(null);
    try {
      const blob = await fetchAsset(asset);
      saveBlob(blob, `${safeName(asset)}.${extensionFor(asset, blob.type)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function downloadSelected() {
    if (!selectedAssets.length || bulkProgress) return;
    setError(null);
    if (selectedAssets.length > MAX_BULK_ASSETS) {
      setError(`Choose at most ${MAX_BULK_ASSETS} assets per ZIP.`);
      return;
    }
    setBulkProgress({ completed: 0, total: selectedAssets.length });
    try {
      const { default: JSZip } = await import("jszip");
      const archive = new JSZip();
      const usedNames = new Set<string>();
      let archiveBytes = 0;
      for (const [index, asset] of selectedAssets.entries()) {
        const blob = await fetchAsset(asset);
        archiveBytes += blob.size;
        if (archiveBytes > MAX_ARCHIVE_BYTES) {
          throw new Error("This selection is larger than 250MB. Download it in smaller batches.");
        }
        archive.file(uniqueArchiveName(asset, blob.type, usedNames), await blob.arrayBuffer());
        setBulkProgress({ completed: index + 1, total: selectedAssets.length });
      }
      const zip = await archive.generateAsync({ type: "blob", compression: "STORE" });
      saveBlob(zip, `video-engine-library-${new Date().toISOString().slice(0, 10)}.zip`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBulkProgress(null);
    }
  }

  async function postInstagram(asset: Asset) {
    if (!confirm(`Publish ${asset.title} to the connected Instagram account now?`)) return;
    setPublishing(asset.id);
    setError(null);
    try {
      const response = await fetch("/api/publish/instagram", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mediaUrl: asset.url,
          mediaType: asset.mediaType === "video" ? "video/mp4" : "image/png",
          caption: asset.prompt || `${asset.title} · ${asset.label}`
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setPublished((previous) => new Set(previous).add(asset.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPublishing(null);
    }
  }

  async function deleteAsset(asset: Asset) {
    if (asset.kind === "reference" || asset.kind === "turnaround") return;
    if (!confirm(`Permanently delete "${asset.title}"? This cannot be undone.`)) return;
    setDeleting(asset.id);
    setError(null);
    try {
      const response = await fetch(`/api/library/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setAssets((previous) => previous.filter((item) => item.id !== asset.id));
      setSelectedIds((previous) => {
        const next = new Set(previous);
        next.delete(asset.id);
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeleting(null);
    }
  }

  async function clearAll() {
    const deletable = assets.filter((asset) => asset.kind !== "reference" && asset.kind !== "turnaround");
    if (!deletable.length) return;
    if (!confirm(`Permanently delete all ${deletable.length} library items? Avatar identity/turnaround images are kept. This cannot be undone.`)) return;
    setClearingAll(true);
    setError(null);
    try {
      for (const asset of deletable) {
        await fetch(`/api/library/assets/${encodeURIComponent(asset.id)}`, { method: "DELETE" }).catch(() => {});
      }
      await load();
    } finally {
      setClearingAll(false);
    }
  }

  async function cleanWriting() {
    setCleaning(true);
    setError(null);
    try {
      const response = await fetch("/api/library/clean", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}"
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCleaning(false);
    }
  }

  const imageCount = assets.filter((asset) => asset.mediaType === "image").length;
  const videoCount = assets.filter((asset) => asset.mediaType === "video").length;
  const bulkLabel = bulkProgress
    ? `Preparing ${bulkProgress.completed}/${bulkProgress.total}…`
    : `Download selected${selectedAssets.length ? ` (${selectedAssets.length})` : ""}`;

  return (
    <AuthGuard>
      <AppShell>
        <main>
          <PageHeader
            eyebrow="Generated media"
            eyebrowIcon={<ImageIcon size={16} />}
            title="Library"
            description="Generated images, canonical identity assets, and completed AI videos. Select any mix of assets and download one organized ZIP, or use the individual media actions."
            actions={(
              <>
                <Button onClick={downloadSelected} disabled={!selectedAssets.length || Boolean(bulkProgress)}>
                  <Download size={14} className="mr-2" />
                  {bulkLabel}
                </Button>
                <Button variant="secondary" onClick={load} disabled={loading || Boolean(bulkProgress)}>
                  <RefreshCcw size={14} className={`mr-2 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button variant="secondary" onClick={cleanWriting} disabled={cleaning || !assets.length || Boolean(bulkProgress)}>
                  <Sparkles size={14} className="mr-2" />
                  {cleaning ? "Cleaning…" : "Clean up writing"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={clearAll}
                  disabled={clearingAll || !assets.length || Boolean(bulkProgress)}
                  className="text-rose-600 hover:text-rose-700"
                >
                  <Trash2 size={14} className="mr-2" />
                  {clearingAll ? "Clearing…" : "Clear all"}
                </Button>
              </>
            )}
          />

          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <Stat label="All media" value={assets.length} />
            <Stat label="Images" value={imageCount} />
            <Stat label="Videos" value={videoCount} />
          </div>

          <div className="mb-5 space-y-3 rounded-2xl border bg-white p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((item) => (
                  <button
                    key={item}
                    onClick={() => setFilter(item)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${filter === item ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <label className="flex h-10 min-w-64 items-center gap-2 rounded-xl border px-3 text-sm">
                <Search size={14} className="text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search generated media"
                  className="min-w-0 flex-1 outline-none"
                  aria-label="Search library"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={toggleVisible}
                disabled={!visible.length || Boolean(bulkProgress)}
                aria-pressed={allVisibleSelected}
              >
                <CheckSquare2 size={14} className="mr-2" />
                {allVisibleSelected ? "Unselect visible" : `Select visible (${visible.length})`}
              </Button>
              {selectedAssets.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={Boolean(bulkProgress)}
                >
                  <X size={14} className="mr-2" />
                  Clear selection
                </Button>
              )}
              <span className="text-xs text-slate-500" aria-live="polite">
                {selectedAssets.length} selected
                {bulkProgress ? ` · preparing ${bulkProgress.completed} of ${bulkProgress.total}` : ""}
              </span>
            </div>
          </div>

          {error && (
            <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}
          <div className="mb-4 text-sm text-slate-500">
            {loading ? "Loading media…" : `${visible.length} of ${assets.length} assets`}
          </div>

          {visible.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((asset) => {
                const selected = selectedIds.has(asset.id);
                return (
                  <figure
                    key={asset.id}
                    className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm ${selected ? "ring-2 ring-violet-500 ring-offset-2" : ""}`}
                  >
                    <label className="absolute left-3 top-3 z-10 grid h-9 w-9 cursor-pointer place-items-center rounded-xl border bg-white/95 shadow-sm">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleAsset(asset.id)}
                        disabled={Boolean(bulkProgress)}
                        aria-label={`Select ${asset.title}`}
                        className="h-4 w-4 accent-violet-600"
                      />
                    </label>
                    <a href={asset.url} target="_blank" rel="noreferrer" className="block aspect-[3/4] overflow-hidden bg-slate-100">
                      {asset.mediaType === "video" ? (
                        <video src={asset.url} muted preload="metadata" className="h-full w-full object-cover" />
                      ) : (
                        <img
                          src={asset.url}
                          alt={`${asset.title} ${asset.label}`}
                          className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                        />
                      )}
                    </a>
                    <figcaption className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{asset.title}</div>
                          <div className="mt-0.5 text-xs capitalize text-slate-500">{asset.label}</div>
                        </div>
                        <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold uppercase text-slate-600">
                          {asset.mediaType === "video" ? <Film size={10} /> : <ImageIcon size={10} />} {asset.kind}
                        </span>
                      </div>
                      {asset.model && <div className="mt-2 truncate text-[10px] text-slate-400" title={asset.model}>{asset.model}</div>}
                      {asset.prompt && <div className="mt-2 line-clamp-2 text-[10px] text-slate-500">{asset.prompt}</div>}
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <Button type="button" variant="secondary" size="sm" aria-label={`Download ${asset.title}`} onClick={() => download(asset)}>
                          <Download size={13} />
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => postInstagram(asset)}
                          disabled={publishing === asset.id || published.has(asset.id)}
                        >
                          <Instagram size={13} className="mr-2" />
                          {published.has(asset.id) ? "Posted" : publishing === asset.id ? "Posting…" : "Post"}
                        </Button>
                        {asset.kind !== "reference" && asset.kind !== "turnaround" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            aria-label={`Delete ${asset.title}`}
                            onClick={() => deleteAsset(asset)}
                            disabled={deleting === asset.id || Boolean(bulkProgress)}
                            className="text-rose-600 hover:text-rose-700"
                          >
                            <Trash2 size={13} />
                          </Button>
                        ) : <span />}
                      </div>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          ) : !loading && (
            <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed bg-white p-8 text-center">
              <div>
                <ImageIcon className="mx-auto mb-3 text-slate-400" />
                <div className="font-medium">No generated media in this view</div>
                <p className="mt-1 text-sm text-slate-500">Generated images and completed videos appear here automatically.</p>
              </div>
            </div>
          )}
        </main>
      </AppShell>
    </AuthGuard>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

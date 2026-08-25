"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Clapperboard, Globe, Megaphone, Plug, Settings as SettingsIcon } from "lucide-react";
import { GeneratorConsole } from "@/components/generator-console";
import { CampaignsConsole } from "@/components/campaigns-console";
import { SitesConsole } from "@/components/sites-console";
import { IntegrationsConsole } from "@/components/integrations-console";
import { SettingsConsole } from "@/components/settings-console";

const TABS = [
  { id: "create", label: "Create", icon: Clapperboard },
  { id: "campaigns", label: "Campaigns", icon: Megaphone },
  { id: "sites", label: "Sites", icon: Globe },
  { id: "connections", label: "Connections", icon: Plug },
  { id: "settings", label: "Settings", icon: SettingsIcon }
] as const;
type TabId = typeof TABS[number]["id"];
function isTabId(value: string | null): value is TabId {
  return Boolean(value) && TABS.some((t) => t.id === value);
}

const CURL = `curl -X POST https://YOUR-DOMAIN/api/v1/video \\
  -H "Authorization: Bearer ve_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "category":"car_accident",
    "mission":"Create a realistic PI awareness shot after a rear-end collision",
    "aspectRatio":"9:16",
    "resolution":"1080p"
  }'`;

function ApiDocs() {
  return (
    <div className="mt-8 border-t pt-6">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700"><BookOpen size={16} />API access</div>
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-5">
          <h3 className="font-medium">1. Create a token</h3>
          <p className="mt-1 text-sm text-slate-600">Use the "VIDEO-Engine API tokens" card above. The raw token is shown once; only its SHA-256 hash is stored.</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-5">
          <h3 className="font-medium">2. Start a one-shot generation</h3>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-cyan-700">{CURL}</pre>
          <p className="mt-3 text-sm text-slate-600">Categories: car_accident, rideshare, trucking, slip_fall, ugc. Optional fields: subject, script, imageBase64, imageMimeType, model, aspectRatio, resolution.</p>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white/80 p-5">
          <h3 className="font-medium">3. Poll status</h3>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-black/40 p-4 text-xs">GET /api/v1/video/&lt;job-id&gt;{"\n"}Authorization: Bearer ve_live_...</pre>
          <p className="mt-3 text-sm text-slate-600">The response contains status = running | succeeded | failed. On success, fileUrl points to the protected MP4 endpoint.</p>
        </section>
      </div>
    </div>
  );
}

function StudioTabsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const fromUrl = sp.get("tab");
  const [tab, setTab] = useState<TabId>(isTabId(fromUrl) ? fromUrl : "create");
  useEffect(() => { if (isTabId(fromUrl) && fromUrl !== tab) setTab(fromUrl); }, [fromUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  function go(next: TabId) {
    setTab(next);
    const url = next === "create" ? "/" : `/?tab=${next}`;
    router.replace(url, { scroll: false });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${active ? "bg-violet-600 text-white shadow-sm" : "bg-white text-slate-700 hover:bg-slate-100"}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={15} />{t.label}
            </button>
          );
        })}
      </div>
      {tab === "create" && <GeneratorConsole />}
      {tab === "campaigns" && <CampaignsConsole onCreateNew={() => go("create")} />}
      {tab === "sites" && <SitesConsole />}
      {tab === "connections" && <IntegrationsConsole />}
      {tab === "settings" && <div><SettingsConsole /><ApiDocs /></div>}
    </div>
  );
}

export function StudioTabs() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading…</div>}>
      <StudioTabsInner />
    </Suspense>
  );
}

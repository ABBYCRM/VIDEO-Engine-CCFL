"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Clapperboard, Image as ImageIcon, Settings as SettingsIcon } from "lucide-react";
import { GeneratorConsole } from "@/components/generator-console";
import { CalendarPage } from "@/app/calendar/page";
import { LibraryPage } from "@/app/library/page";

const TABS = [
  { id: "create", label: "Studio", icon: Clapperboard },
  { id: "gallery", label: "Gallery", icon: ImageIcon },
  { id: "calendar", label: "Schedule", icon: CalendarDays },
  { id: "settings", label: "Settings", icon: SettingsIcon }
] as const;
type TabId = typeof TABS[number]["id"];

function StudioTabsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const fromUrl = sp.get("tab");
  const [tab, setTab] = useState<TabId>(
    fromUrl && TABS.some(t => t.id === fromUrl) ? (fromUrl as TabId) : "create"
  );

  useEffect(() => {
    if (fromUrl && TABS.some(t => t.id === fromUrl) && fromUrl !== tab) {
      setTab(fromUrl as TabId);
    }
  }, [fromUrl]);

  function go(next: TabId) {
    setTab(next);
    router.replace(next === "create" ? "/" : `/?tab=${next}`, { scroll: false });
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-amber-900/30 bg-black/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Clapperboard size={16} className="text-black" />
            </div>
            <h1 className="text-lg font-bold tracking-wider bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent">
              VIDEO ENGINE
            </h1>
          </div>
          <div className="flex gap-1">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => go(t.id)}
                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                    active
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                >
                  <Icon size={16} />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {tab === "create" && <GeneratorConsole />}
        {tab === "gallery" && <LibraryPage />}
        {tab === "calendar" && <CalendarPage />}
        {tab === "settings" && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-amber-100">Settings</h2>
            <p className="text-slate-400">Configure API keys, avatars, and auto-post preferences.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function StudioTabs() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-amber-400">Loading studio...</div>}>
      <StudioTabsInner />
    </Suspense>
  );
}

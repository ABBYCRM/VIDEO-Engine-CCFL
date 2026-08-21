"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Clapperboard, Settings, BookOpen, LogOut, Megaphone, Users,
  Calendar, Plug, Library, Mic, Plus, Globe, ChevronRight, X
} from "lucide-react";
import { DuckMark } from "@/components/duck-mark";

type NavItem = { href: string; label: string; icon: any; group: "WORKSPACE" | "WORKFLOW" | "ACCOUNT"; badge?: "new" | number; exact?: boolean };

const NAV: NavItem[] = [
  { href: "/",                  label: "Generate",      icon: Clapperboard, group: "WORKSPACE", exact: true },
  { href: "/campaigns",         label: "Campaigns",     icon: Megaphone,   group: "WORKSPACE" },
  { href: "/avatars",           label: "Avatars",       icon: Users,       group: "WORKSPACE" },
  { href: "/calendar",          label: "Calendar",      icon: Calendar,    group: "WORKFLOW" },
  { href: "/library",           label: "Library",       icon: Library,     group: "WORKFLOW" },
  { href: "/podcast-interview", label: "Podcast Style", icon: Mic,         group: "WORKFLOW", badge: "new" },
  { href: "/integrations",      label: "Integrations",  icon: Plug,        group: "ACCOUNT" },
  { href: "/docs",              label: "API",           icon: BookOpen,    group: "ACCOUNT" },
  { href: "/settings",          label: "Settings",      icon: Settings,    group: "ACCOUNT" }
];
const GROUPS: NavItem["group"][] = ["WORKSPACE", "WORKFLOW", "ACCOUNT"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen text-slate-900">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/90 px-4 py-2.5 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2"><DuckMark size={28}/><span className="text-[15px] font-semibold tracking-tight">VIDEO-Engine</span></Link>
        <button type="button" onClick={() => setMobileOpen(v => !v)} className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700" aria-label="Toggle navigation">
          {mobileOpen ? <X size={16}/> : <Plus size={16}/>}
        </button>
      </header>

      <div className="flex">
        <aside className={`fixed inset-y-0 left-0 z-20 w-64 border-r border-slate-200 bg-white transition-transform md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200 p-3">
              <Link href="/" className="mb-3 flex items-center gap-2 px-1.5">
                <DuckMark size={32}/>
                <span className="bg-gradient-to-r from-violet-700 via-violet-500 to-violet-700 bg-clip-text text-base font-semibold tracking-tight text-transparent">VIDEO-Engine</span>
                <span className="ml-auto rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">CCFL</span>
              </Link>
              <Link href="/campaigns" onClick={() => setMobileOpen(false)} className="group flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/50 px-2 py-1.5 text-left transition hover:bg-slate-100" aria-label="Open CaseClosedFL campaigns">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white text-slate-500 ring-1 ring-slate-200"><Globe size={14}/></span>
                <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium text-slate-900">CaseClosedFL | Florida</div><div className="truncate text-[11px] text-slate-500">caseclosedfl.com</div></div>
                <ChevronRight size={14} className="text-slate-600"/>
              </Link>
            </div>

            <nav className="flex-1 overflow-y-auto px-2 pb-2">
              {GROUPS.map(group => (
                <div key={group}>
                  <div className="soro-group">{group}</div>
                  <ul className="flex flex-col gap-0.5">
                    {NAV.filter(n => n.group === group).map(n => {
                      const I = n.icon;
                      const active = n.exact ? path === n.href : path.startsWith(n.href);
                      return <li key={n.href}><Link href={n.href} onClick={() => setMobileOpen(false)} className={`group flex items-center gap-2 rounded-xl px-2.5 py-2 text-[14px] transition ${active ? "bg-violet-50 font-semibold text-violet-700" : "text-slate-700 hover:bg-slate-50"}`}>
                        <I size={16} className={active ? "text-violet-600" : "text-slate-500"}/><span className="flex-1 truncate">{n.label}</span>{n.badge === "new" && <span className="soro-new-pill">new</span>}
                      </Link></li>;
                    })}
                  </ul>
                </div>
              ))}

              <div className="soro-group">Sites</div>
              <Link href="/campaigns" onClick={() => setMobileOpen(false)} className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[14px] text-slate-500 transition hover:bg-slate-50 hover:text-slate-700">
                <Plus size={16} className="text-slate-600"/><span>Manage websites</span>
              </Link>
            </nav>

            <div className="border-t border-slate-200 p-2">
              <div className="flex items-center gap-2 rounded-xl px-2 py-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-xs font-semibold text-white">PA</span>
                <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-medium text-slate-900">PA</div><div className="truncate text-[11px] text-slate-500">Admin</div></div>
                <button type="button" onClick={logout} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Sign out"><LogOut size={15}/></button>
              </div>
            </div>
          </div>
        </aside>

        {mobileOpen && <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-10 bg-slate-100/30 md:hidden"/>}
        <main className="min-h-screen flex-1 md:ml-64"><div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">{children}</div></main>
      </div>
    </div>
  );
}

"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Clapperboard,
  Settings,
  BookOpen,
  LogOut,
  Megaphone,
  Users,
  Calendar,
  Plug,
  Library,
  Mic,
  Sparkles,
  Menu as MenuIcon,
  X,
  ChevronRight
} from "lucide-react";
import { DuckMark } from "@/components/duck-mark";

const NAV: { href: string; label: string; icon: any; group: string; exact?: boolean }[] = [
  { href: "/",                    label: "Generate",      icon: Clapperboard, group: "Workspace", exact: true },
  { href: "/campaigns",           label: "Campaigns",     icon: Megaphone,   group: "Workspace" },
  { href: "/avatars",             label: "Avatars",       icon: Users,       group: "Workspace" },
  { href: "/calendar",            label: "Calendar",      icon: Calendar,    group: "Workflow" },
  { href: "/library",             label: "Library",       icon: Library,     group: "Workflow" },
  { href: "/podcast-interview",   label: "Podcast Style", icon: Mic,         group: "Workflow" },
  { href: "/integrations",        label: "Integrations",  icon: Plug,        group: "Account" },
  { href: "/components-demo",     label: "Components",    icon: Sparkles,    group: "Account" },
  { href: "/docs",                label: "API",           icon: BookOpen,    group: "Account" },
  { href: "/settings",            label: "Settings",      icon: Settings,    group: "Account" }
];

const GROUPS = ["Workspace", "Workflow", "Account"] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Close on outside click + escape
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;
      if (menuRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); triggerRef.current?.focus(); }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close on route change
  useEffect(() => { setOpen(false); }, [path]);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/login");
  }

  const activeLabel = (() => {
    const found = NAV.find(n => n.exact ? path === n.href : path.startsWith(n.href));
    return found?.label ?? "Menu";
  })();

  return (
    <div className="min-h-screen">
      {/* Floating glass nav — pinned to top, sits above page content */}
      <div className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 rounded-2xl glass-pill px-3 py-2">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-2 pl-1 pr-2 font-semibold">
            <DuckMark size={32} />
            <span className="hidden bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-transparent sm:inline">
              VIDEO-Engine
            </span>
            <span className="rounded-full border border-slate-200 bg-white/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-600">
              CCFL
            </span>
          </Link>

          {/* Center: current page label (visible on small screens, always-on on big) */}
          <div className="hidden text-sm font-medium text-slate-700 md:block">
            {activeLabel}
          </div>

          {/* Right: menu trigger + sign-out */}
          <div className="flex items-center gap-1">
            <button
              ref={triggerRef}
              onClick={() => setOpen(v => !v)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:bg-white hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {open ? <X size={15} /> : <MenuIcon size={15} />}
              <span>Menu</span>
            </button>
            <button
              onClick={logout}
              aria-label="Sign out"
              className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white/70 text-slate-700 transition hover:bg-white hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* The dropdown panel */}
        {open && (
          <div
            ref={menuRef}
            role="menu"
            className="mx-auto mt-2 max-w-6xl"
          >
            <div className="glass-strong rounded-2xl p-3 shadow-[0_20px_60px_-20px_rgba(15,23,42,0.25)]">
              <div className="grid gap-2 md:grid-cols-3">
                {GROUPS.map(group => {
                  const items = NAV.filter(n => n.group === group);
                  return (
                    <div key={group} className="rounded-xl bg-white/50 p-2">
                      <div className="mb-1 px-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {group}
                      </div>
                      <div className="grid gap-0.5">
                        {items.map(n => {
                          const I = n.icon;
                          const active = n.exact ? path === n.href : path.startsWith(n.href);
                          return (
                            <Link
                              key={n.href}
                              href={n.href}
                              onClick={() => setOpen(false)}
                              className={`group flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
                                active
                                  ? "bg-cyan-500/12 text-cyan-800 ring-1 ring-cyan-400/30"
                                  : "text-slate-700 hover:bg-white hover:text-slate-900"
                              }`}
                            >
                              <span className="flex items-center gap-2.5">
                                <span className={`grid h-7 w-7 place-items-center rounded-md ${
                                  active ? "bg-cyan-500/20 text-cyan-700" : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
                                }`}>
                                  <I size={14} />
                                </span>
                                <span className="font-medium">{n.label}</span>
                              </span>
                              <ChevronRight size={14} className="opacity-40 group-hover:opacity-70" />
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 border-t border-slate-200/70 px-3 py-2 text-[11px] text-slate-500">
                One continuous shot · 8 seconds · native audio
              </div>
            </div>
          </div>
        )}
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

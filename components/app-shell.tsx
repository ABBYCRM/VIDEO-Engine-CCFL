"use client";
// Secondary-page chrome. Claw owns the full-screen Grok chat shell.
// No login/logout. Matches the 21st / Grok zinc look.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { X, MessageSquare, Menu, Plug, Settings, Monitor, CalendarClock } from "lucide-react";
import { ClawLogo } from "@/components/claw-logo";

type NavItem = { href: string; label: string; icon: typeof MessageSquare };

const NAV: NavItem[] = [
  { href: "/claw", label: "Claw", icon: MessageSquare },
  { href: "/computer", label: "Computer", icon: Monitor },
  { href: "/routines", label: "Routines", icon: CalendarClock },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.clawTheme) return;
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("claw-theme")) as "light" | "dark" | null;
    const initial = saved === "light" || saved === "dark"
      ? saved
      : (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.dataset.clawTheme = initial;
    root.classList.toggle("dark", initial === "dark");
  }, []);

  return (
    <div className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-neutral-200 bg-white/90 px-4 py-2.5 backdrop-blur-sm dark:border-neutral-800 dark:bg-neutral-950/90">
        <Link href="/claw" className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center overflow-hidden rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-950">
            <ClawLogo size={18} className="shrink-0" alt="" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight">Claw</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-neutral-200 text-neutral-700 dark:border-neutral-800 dark:text-neutral-200"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        >
          {mobileOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </header>

      <div className="flex">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] border-r border-neutral-200 bg-neutral-50 transition-transform dark:border-neutral-800 dark:bg-neutral-950 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-neutral-200 p-3 dark:border-neutral-800">
              <Link href="/claw" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <div className="grid h-7 w-7 place-items-center overflow-hidden rounded-md bg-neutral-900 text-white dark:bg-white dark:text-neutral-950">
                  <ClawLogo size={18} className="shrink-0" alt="" />
                </div>
                <span className="text-base font-semibold tracking-tight">Claw</span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Close navigation"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 pb-2 pt-2">
              <ul className="flex flex-col gap-0.5">
                {NAV.map((n) => {
                  const I = n.icon;
                  const active = path === n.href || path.startsWith(n.href + "/");
                  return (
                    <li key={n.href}>
                      <Link
                        href={n.href}
                        onClick={() => setMobileOpen(false)}
                        className={`group flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] transition ${
                          active
                            ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-white"
                            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-900 dark:hover:text-neutral-100"
                        }`}
                      >
                        <I size={16} className={active ? "text-neutral-900 dark:text-white" : "text-neutral-400"} />
                        <span className="flex-1 truncate">{n.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </aside>

        {mobileOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-black/40"
          />
        )}

        <main className="min-h-[calc(100vh-49px)] flex-1">{children}</main>
      </div>
    </div>
  );
}

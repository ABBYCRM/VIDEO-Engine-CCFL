"use client";
// Minimal app shell for the secondary pages (Integrations). The Claw
// console renders its own full-screen shell; this one just gives the
// other pages a matching header + nav. Private deployment, so there is
// no login/logout here.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { X, MessageSquare, Menu, Plug, Settings } from "lucide-react";
import { ClawLogo } from "@/components/claw-logo";

type NavItem = { href: string; label: string; icon: any };

const NAV: NavItem[] = [
  { href: "/claw", label: "Claw", icon: MessageSquare },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Share the Claw console's theme so the warm --claw-* tokens resolve on the
  // secondary pages too (Integrations). Mirrors the hydration in
  // components/claw-console.tsx: read the saved / system preference and set
  // html[data-claw-theme]. We don't own a toggle here — we just follow it.
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.clawTheme) return; // Claw console already set it
    const saved = (typeof localStorage !== "undefined" && localStorage.getItem("claw-theme")) as "light" | "dark" | null;
    const initial = saved === "light" || saved === "dark"
      ? saved
      : (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    root.dataset.clawTheme = initial;
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sticky header — glass in dark mode */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur
        dark:bg-[rgba(5,5,15,0.85)] dark:border-[rgba(180,180,255,0.12)]">
        <Link href="/claw" className="flex items-center gap-2">
          <div className="relative block overflow-hidden rounded-lg" style={{ width: 28, height: 28 }}>
            <ClawLogo size={28} className="shrink-0" alt="" />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-foreground dark:text-[rgba(220,220,255,0.90)]">Claw</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-background text-foreground
            dark:border-[rgba(180,180,255,0.15)] dark:bg-[rgba(255,255,255,0.06)] dark:text-[rgba(220,220,255,0.60)]
            active:bg-muted dark:active:bg-[rgba(255,255,255,0.10)]"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        >
          {mobileOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </header>

      <div className="flex">
        {/* Sidebar — glass in dark mode */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] border-r border-border bg-background transition-transform
            dark:bg-[rgba(5,5,15,0.88)] dark:border-[rgba(180,180,255,0.12)] dark:backdrop-blur-xl
            ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border p-3
              dark:border-[rgba(180,180,255,0.10)]">
              <Link href="/claw" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <div className="relative block overflow-hidden rounded-lg" style={{ width: 28, height: 28 }}>
                  <ClawLogo size={28} className="shrink-0" alt="" />
                </div>
                <span className="text-base font-semibold tracking-tight text-foreground dark:text-[rgba(220,220,255,0.90)]">Claw</span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted
                  dark:text-[rgba(220,220,255,0.40)] dark:hover:bg-[rgba(255,255,255,0.08)] dark:hover:text-[rgba(220,220,255,0.80)]"
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
                        className={`group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] transition ${
                          active
                            ? "bg-[rgba(199,100,67%,0.12)] font-semibold dark:text-[rgba(220,220,255,0.90)] dark:border dark:border-[rgba(199,100,67%,0.25)]"
                            : "text-foreground hover:bg-muted dark:text-[rgba(220,220,255,0.50)] dark:hover:bg-[rgba(255,255,255,0.06)]"
                        }`}
                      >
                        <I size={16} className={active ? "text-[rgba(199,100,67%,1)] dark:text-[var(--claw-accent)]" : "text-muted-foreground dark:text-[rgba(220,220,255,0.35)]"} />
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
            className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm dark:bg-black/60"
          />
        )}

        <main className="min-h-[calc(100vh-49px)] flex-1">{children}</main>
      </div>
    </div>
  );
}

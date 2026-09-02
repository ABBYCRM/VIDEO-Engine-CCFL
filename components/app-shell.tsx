"use client";
// Minimal app shell for the secondary pages (Integrations). The Claw
// console renders its own full-screen shell; this one just gives the
// other pages a matching header + nav. Private deployment, so there is
// no login/logout here.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { X, MessageSquare, Menu, Plug } from "lucide-react";
import { ClawLogo } from "@/components/claw-logo";

type NavItem = { href: string; label: string; icon: any };

const NAV: NavItem[] = [
  { href: "/claw", label: "Claw", icon: MessageSquare },
  { href: "/integrations", label: "Integrations", icon: Plug }
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
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-2.5 backdrop-blur">
        <Link href="/claw" className="flex items-center gap-2">
          <ClawLogo size={28} className="shrink-0" alt="" />
          <span className="text-[15px] font-semibold tracking-tight">Claw</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-background text-foreground active:bg-muted"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        >
          {mobileOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </header>

      <div className="flex">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] border-r border-border bg-background transition-transform ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-border p-3">
              <Link href="/claw" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <ClawLogo size={28} className="shrink-0" alt="" />
                <span className="text-base font-semibold tracking-tight">Claw</span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
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
                          active ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted"
                        }`}
                      >
                        <I size={16} className={active ? "text-primary" : "text-muted-foreground"} />
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
            className="fixed inset-0 z-30 bg-foreground/40"
          />
        )}

        <main className="min-h-[calc(100vh-49px)] flex-1">{children}</main>
      </div>
    </div>
  );
}

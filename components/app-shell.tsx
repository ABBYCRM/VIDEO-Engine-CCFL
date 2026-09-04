"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { X, MessageSquare, Menu, Plug, Megaphone, Moon, Sun, Activity, ArrowUpRight } from "lucide-react";
import { ClawLogo } from "@/components/claw-logo";

type NavItem = { href: string; label: string; caption: string; icon: LucideIcon; index: string };

const NAV: NavItem[] = [
  { href: "/claw", label: "Claw", caption: "Operator", icon: MessageSquare, index: "01" },
  { href: "/mktn", label: "MKTN", caption: "Campaign OS", icon: Megaphone, index: "02" },
  { href: "/integrations", label: "Integrations", caption: "Tool mesh", icon: Plug, index: "03" }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const root = document.documentElement;
    const saved = localStorage.getItem("claw-theme");
    const initial = saved === "light" || saved === "dark"
      ? saved
      : window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    root.dataset.clawTheme = initial;
    setTheme(initial);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.clawTheme = next;
    localStorage.setItem("claw-theme", next);
  }

  const navigation = (
    <>
      <div className="flex h-[76px] items-center justify-between border-b border-border px-5">
        <Link href="/claw" className="group flex items-center gap-3" onClick={() => setMobileOpen(false)}>
          <span className="relative grid h-9 w-9 place-items-center overflow-hidden rounded-lg border border-[hsl(var(--claw-accent))]/30 bg-[hsl(var(--claw-accent))]/10">
            <ClawLogo size={25} className="relative z-10" alt="" />
          </span>
          <span>
            <span className="block text-[15px] font-semibold tracking-[-0.02em]">CLAW</span>
            <span className="block font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Control system</span>
          </span>
        </Link>
        <button type="button" onClick={() => setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:hidden" aria-label="Close navigation"><X size={17} /></button>
      </div>

      <nav className="flex-1 px-3 py-5" aria-label="Primary navigation">
        <div className="mb-3 px-3 font-mono text-[9px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Workspaces</div>
        <ul className="space-y-1.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = path === item.href || path.startsWith(`${item.href}/`);
            return <li key={item.href}>
              <Link href={item.href} onClick={() => setMobileOpen(false)} aria-current={active ? "page" : undefined}
                className={`group relative flex min-h-[58px] items-center gap-3 overflow-hidden rounded-lg border px-3 transition-all ${active ? "border-[hsl(var(--claw-accent))]/35 bg-[hsl(var(--claw-accent))]/10 text-foreground" : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"}`}>
                {active && <span className="absolute inset-y-2 left-0 w-0.5 bg-[hsl(var(--claw-accent))] shadow-[0_0_16px_hsl(var(--claw-accent))]" />}
                <span className={`grid h-8 w-8 place-items-center rounded-md border ${active ? "border-[hsl(var(--claw-accent))]/25 text-[hsl(var(--claw-accent))]" : "border-border/70 group-hover:border-[hsl(var(--border-strong))]"}`}><Icon size={15} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.label}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{item.caption}</span>
                </span>
                <span className="font-mono text-[9px] text-muted-foreground/70">{item.index}</span>
              </Link>
            </li>;
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <div className="mb-2 rounded-lg border border-border bg-background/45 p-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="signal-label">System mesh</span>
            <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase text-[hsl(var(--success))]"><span className="signal-dot !h-1.5 !w-1.5 !bg-[hsl(var(--success))]" /> live</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">NVIDIA reasoning · provider failover · Composio actions</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={toggleTheme} className="flex h-10 flex-1 items-center gap-2 rounded-md px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />} {theme === "dark" ? "Light signal" : "Dark signal"}
          </button>
          <Link href="/integrations" className="grid h-10 w-10 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Open integrations"><ArrowUpRight size={14} /></Link>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-border bg-[hsl(var(--claw-sidebar))]/95 backdrop-blur-xl md:flex">{navigation}</aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-xl md:hidden">
        <Link href="/claw" className="flex items-center gap-2.5"><ClawLogo size={26} alt="" /><span className="text-sm font-semibold tracking-tight">CLAW</span></Link>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground min-[380px]:flex"><Activity size={12} className="text-[hsl(var(--claw-accent))]" /> online</span>
          <button type="button" onClick={() => setMobileOpen(true)} className="grid h-10 w-10 place-items-center rounded-md border border-border bg-[hsl(var(--claw-elevated))]" aria-label="Open navigation"><Menu size={17} /></button>
        </div>
      </header>

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[294px] max-w-[86vw] flex-col border-r border-border bg-[hsl(var(--claw-sidebar))] transition-transform duration-300 md:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>{navigation}</aside>
      {mobileOpen && <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden" />}

      <main className="min-h-screen md:pl-[264px]">{children}</main>
    </div>
  );
}

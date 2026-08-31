"use client";
// 2026-08-30 "Claw only" repo strip: minimal app shell with just the
// Claw nav and the Integrations nav. DuckMark, MobileFrame, and the
// Calendar/Library/Settings nav items are gone with the rest of the
// pre-Claw build.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, X, Bird, Menu, Plug } from "lucide-react";

type NavItem = { href: string; label: string; icon: any };

const NAV: NavItem[] = [
  { href: "/claw", label: "Claw", icon: Bird },
  { href: "/integrations", label: "Integrations", icon: Plug }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
        <Link href="/claw" className="flex items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight">Claw</span>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">CCFL</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 active:bg-slate-100"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        >
          {mobileOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </header>

      <div className="flex">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] border-r border-slate-200 bg-white transition-transform ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 p-3">
              <Link href="/claw" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <span className="bg-gradient-to-r from-violet-700 via-violet-500 to-violet-700 bg-clip-text text-base font-semibold tracking-tight text-transparent">
                  Claw
                </span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  CCFL
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close navigation"
              >
                <X size={16} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 pb-2">
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
                          active ? "bg-violet-50 font-semibold text-violet-700" : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <I size={16} className={active ? "text-violet-600" : "text-slate-500"} />
                        <span className="flex-1 truncate">{n.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="border-t border-slate-200 p-2">
              <div className="flex items-center gap-2 rounded-xl px-2 py-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-xs font-semibold text-white">
                  A
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">Admin</div>
                  <div className="truncate text-[11px] text-slate-500">Claw operator</div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                  aria-label="Sign out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
          </div>
        </aside>

        {mobileOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-slate-900/40"
          />
        )}

        <main className="min-h-[calc(100vh-49px)] flex-1">{children}</main>
      </div>
    </div>
  );
}

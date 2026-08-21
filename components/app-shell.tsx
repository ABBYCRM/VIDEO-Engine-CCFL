"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DuckMark } from "@/components/duck-mark";

const NAV: { href: string; label: string; icon: any; exact?: boolean }[] = [
  { href: "/", label: "Generate", icon: Clapperboard, exact: true },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/avatars", label: "Avatars", icon: Users },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/library", label: "Library", icon: Library },
  { href: "/integrations", label: "Integrations", icon: Plug },
  { href: "/podcast-interview", label: "Podcast", icon: Mic },
  { href: "/components-demo", label: "Components", icon: Sparkles },
  { href: "/docs", label: "API", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/login");
  }
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <DuckMark size={36} />
            <span className="bg-gradient-to-r from-cyan-200 via-sky-200 to-violet-200 bg-clip-text text-transparent">
              VIDEO-Engine
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-900/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
              CCFL
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => {
              const I = n.icon;
              const active = n.exact ? path === n.href : path.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition ${
                    active ? "bg-slate-800 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  <I size={14} />
                  {n.label}
                </Link>
              );
            })}
            <Button variant="outline" size="sm" onClick={logout} className="ml-2">
              <LogOut size={15} />
            </Button>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}

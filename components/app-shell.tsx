"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Clapperboard, Settings, BookOpen, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter();
  async function logout() { await fetch("/api/admin/logout", { method: "POST" }); router.push("/login"); }
  return <div className="min-h-screen">
    <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-slate-950/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold"><span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400 text-slate-950"><Clapperboard size={19}/></span> VIDEO-Engine</Link>
        <nav className="flex items-center gap-2">
          <Link className={`rounded-lg px-3 py-2 text-sm ${path==="/"?"bg-slate-800":"text-slate-400 hover:text-white"}`} href="/">Generate</Link>
          <Link className={`rounded-lg px-3 py-2 text-sm ${path.startsWith("/docs")?"bg-slate-800":"text-slate-400 hover:text-white"}`} href="/docs"><BookOpen size={16} className="inline mr-1"/>API</Link>
          <Link className={`rounded-lg px-3 py-2 text-sm ${path.startsWith("/settings")?"bg-slate-800":"text-slate-400 hover:text-white"}`} href="/settings"><Settings size={16} className="inline mr-1"/>Settings</Link>
          <Button variant="outline" size="sm" onClick={logout}><LogOut size={15}/></Button>
        </nav>
      </div>
    </header>
    {children}
  </div>;
}

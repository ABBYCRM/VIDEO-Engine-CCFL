"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut, Calendar, Library, X, Cog, Bird, Menu, Film } from "lucide-react";
import { DuckMark } from "@/components/duck-mark";
import { MobileFrame } from "@/components/mobile-frame";

type NavItem={href:string;label:string;icon:any;group:"CREATE"|"REVIEW"|"OPS";exact?:boolean};
// 2026-08-27 operator directive simplified the live nav down to Creator
// (manual upload), Calendar, Library, Claw, Settings. Avatars / Campaigns /
// Pipeline / Sites / Integrations stay off the rail (still on disk,
// 410/redirect-gated in next.config.ts) — that's a surface-simplification
// call independent of image generation, so it's unchanged by the
// 2026-08-28 directive that turned IMAGE_GEN_ENABLED back on.
// 2026-08-28: Create also dropped from the nav — Claw's generate_video /
// generate_still / ugc_batch_generate tools are the same server functions
// Create called, so the page was a redundant front end regardless of the
// image-gen flag. Root "/" now redirects to Calendar; app/page.tsx and
// unified-create-console.tsx are left on disk, unlinked.
const NAV:NavItem[]=[
  {href:"/claw",label:"Claw",icon:Bird,group:"CREATE"},
  {href:"/creator",label:"Creator",icon:Film,group:"CREATE"},
  {href:"/calendar",label:"Calendar",icon:Calendar,group:"REVIEW"},
  {href:"/library",label:"Library",icon:Library,group:"REVIEW"},
  {href:"/settings",label:"Settings",icon:Cog,group:"OPS"}
];
const GROUPS:NavItem["group"][]=["CREATE","REVIEW","OPS"];

export function AppShell({children,fullBleed}:{children:React.ReactNode;fullBleed?:boolean}){
  const path=usePathname(),router=useRouter();const[mobileOpen,setMobileOpen]=useState(false);
  async function logout(){await fetch("/api/admin/logout",{method:"POST"});router.push("/login")}

  // Mobile-first: always use the mobile layout. On desktop browsers the MobileFrame
  // component renders the children inside a 430px-wide phone window. On real mobile
  // devices the children render full-bleed.
  const content = (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Mobile header — always visible */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
        <Link href="/" className="flex items-center gap-2">
          <DuckMark size={28}/>
          <span className="text-[15px] font-semibold tracking-tight">VIDEO-Engine</span>
        </Link>
        <button
          type="button"
          onClick={()=>setMobileOpen(v=>!v)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 active:bg-slate-100"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        >
          {mobileOpen ? <X size={16}/> : <Menu size={16}/>}
        </button>
      </header>

      <div className="flex">
        {/* Left rail — always drawer-style, never persistent on desktop */}
        <aside className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] border-r border-slate-200 bg-white transition-transform ${mobileOpen?"translate-x-0":"-translate-x-full"}`}>
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 p-3">
              <Link href="/" className="flex items-center gap-2" onClick={()=>setMobileOpen(false)}>
                <DuckMark size={32}/>
                <span className="bg-gradient-to-r from-violet-700 via-violet-500 to-violet-700 bg-clip-text text-base font-semibold tracking-tight text-transparent">VIDEO-Engine</span>
                <span className="ml-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">CCFL</span>
              </Link>
              <button type="button" onClick={()=>setMobileOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close navigation">
                <X size={16}/>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 pb-2">
              {GROUPS.map(group=>(
                <div key={group} className="mb-1">
                  <div className="soro-group px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{group}</div>
                  <ul className="flex flex-col gap-0.5">
                    {NAV.filter(n=>n.group===group).map(n=>{
                      const I=n.icon;
                      const active=n.exact?path===n.href:path.startsWith(n.href);
                      return (
                        <li key={n.href}>
                          <Link
                            href={n.href}
                            onClick={()=>setMobileOpen(false)}
                            className={`group flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] transition ${active?"bg-violet-50 font-semibold text-violet-700":"text-slate-700 hover:bg-slate-50"}`}
                          >
                            <I size={16} className={active?"text-violet-600":"text-slate-500"}/>
                            <span className="flex-1 truncate">{n.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>
            <div className="border-t border-slate-200 p-2">
              <div className="flex items-center gap-2 rounded-xl px-2 py-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-violet-700 text-xs font-semibold text-white">PA</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium">PA</div>
                  <div className="truncate text-[11px] text-slate-500">Admin</div>
                </div>
                <button type="button" onClick={logout} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Sign out">
                  <LogOut size={15}/>
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Backdrop — closes the drawer on tap */}
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={()=>setMobileOpen(false)}
            className="fixed inset-0 z-30 bg-slate-900/40"
          />
        )}

        <main className="min-h-screen w-full min-w-0 flex-1 overflow-x-hidden">
          {fullBleed ? children : <div className="mx-auto w-full max-w-[480px] px-4 py-5 sm:px-5 sm:py-6">{children}</div>}
        </main>
      </div>
    </div>
  );

  return <MobileFrame>{content}</MobileFrame>;
}

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter(); const [ok,setOk]=useState(false);
  useEffect(()=>{ fetch("/api/admin/session").then(r=>{if(r.ok)setOk(true);else router.replace("/login")}).catch(()=>router.replace("/login")); },[router]);
  if(!ok) return <div className="grid min-h-[70vh] place-items-center text-slate-400">Checking session…</div>;
  return <>{children}</>;
}

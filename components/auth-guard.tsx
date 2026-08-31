"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/session", { credentials: "same-origin" })
      .then(async (r) => {
        if (cancelled) return;
        if (r.ok) {
          setOk(true);
        } else {
          router.replace("/login");
        }
      })
      .catch(() => {
        if (!cancelled) router.replace("/login");
      });
    return () => { cancelled = true; };
  }, [router]);
  if (!ok) return <div className="grid min-h-[70vh] place-items-center text-slate-600">Checking session…</div>;
  return <>{children}</>;
}

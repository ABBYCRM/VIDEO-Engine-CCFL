"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/session", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal
    })
      .then((response) => {
        if (!response.ok) throw new Error("unauthorized");
        return response.json() as Promise<{ authenticated?: boolean }>;
      })
      .then((body) => {
        if (body.authenticated) {
          setAuthorized(true);
          setChecked(true);
          return;
        }
        throw new Error("unauthorized");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAuthorized(false);
        setChecked(true);
        const next = pathname && pathname !== "/login" ? `?next=${encodeURIComponent(pathname)}` : "";
        router.replace(`/login${next}`);
      });

    return () => controller.abort();
  }, [pathname, router]);

  if (!checked || !authorized) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6" aria-busy="true">
        <p className="text-sm text-muted-foreground">Checking session…</p>
      </main>
    );
  }

  return <>{children}</>;
}

"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * MobileFrame
 *
 * On a real mobile device (screen width <= 640px OR coarse pointer), the children
 * render full-bleed as a normal page. The user-agent viewport meta is set to 430px,
 * which means the app draws exactly the same way on a Pixel 7, an iPhone 15, or a
 * Galaxy S23 — same column widths, same touch targets, same breakpoint behavior.
 *
 * On a desktop browser (screen width > 640px AND fine pointer), the children render
 * inside a 430px-wide centered "phone window" with a subtle device frame. The user
 * can drag / scroll inside that window, but the rest of the page is the dimmed
 * background. This gives the "phone-sized window" experience the operator asked for.
 *
 * The frame is purely a presentation concern — no DOM portal, no scroll lock on the
 * outer page. The frame's height is capped to viewport height so the inner content
 * scrolls naturally.
 */
export function MobileFrame({ children }: { children: ReactNode }) {
  // We start as "unknown" so SSR doesn't have a flicker. After mount we read the
  // pointer to decide.
  const [mode, setMode] = useState<"unknown" | "mobile" | "framed">("unknown");

  useEffect(() => {
    const mqCoarse = window.matchMedia("(pointer: coarse)");
    const mqMobile = window.matchMedia("(max-width: 640px)");
    function update() {
      const isMobile = mqCoarse.matches || mqMobile.matches;
      setMode(isMobile ? "mobile" : "framed");
    }
    update();
    mqCoarse.addEventListener("change", update);
    mqMobile.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mqCoarse.removeEventListener("change", update);
      mqMobile.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  if (mode === "unknown") {
    // Render children as-is during SSR / first paint; this keeps the initial
    // paint identical to the framed view, and the mode swap on mount won't
    // re-flow the layout because both modes use the same content.
    return <>{children}</>;
  }

  if (mode === "mobile") {
    return <>{children}</>;
  }

  // Framed: a phone-sized window on the desktop background.
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200">
      <div className="flex min-h-screen items-center justify-center p-6">
        <div
          className="relative w-[430px] max-w-full overflow-hidden rounded-[36px] border-[10px] border-slate-900 bg-white shadow-2xl ring-1 ring-slate-900/5"
          style={{ height: "min(900px, calc(100dvh - 48px))" }}
        >
          {/* Status bar (decorative) */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex h-7 items-center justify-between bg-white px-6 text-[11px] font-semibold text-slate-700">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <span>5G</span>
              <span>·</span>
              <span>100%</span>
            </div>
          </div>
          {/* Notch (decorative) */}
          <div className="pointer-events-none absolute left-1/2 top-0 z-50 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
          {/* Scrollable inner area */}
          <div
            className="h-full w-full overflow-y-auto bg-white pt-7"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

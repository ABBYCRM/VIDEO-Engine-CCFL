"use client";
import Link from "next/link";

/**
 * Standard "feature disabled" screen shown on every page that the operator
 * removed from the live UI in 2026-08-27. The page route still exists (so the
 * code is preserved on disk) but the operator only sees this when navigating
 * directly. A back link sends them to the working Calendar.
 */
export function FeatureDisabled({ feature, description, backHref = "/calendar" }: {
  feature: string;
  description: string;
  backHref?: string;
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-700">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
      </div>
      <h1 className="mt-3 text-lg font-semibold text-slate-900">{feature} is paused</h1>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <p className="mt-3 text-xs text-slate-500">
        Manual calendar mode is on. All image-generation code is kept on disk — flip
        <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 font-mono text-[10px] text-slate-700">IMAGE_GEN_ENABLED=true</code>
        to bring this back.
      </p>
      <div className="mt-5 flex justify-center gap-2">
        <Link href={backHref} className="inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700">
          Go to Calendar
        </Link>
        <Link href="/" className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Go to Create
        </Link>
      </div>
    </div>
  );
}

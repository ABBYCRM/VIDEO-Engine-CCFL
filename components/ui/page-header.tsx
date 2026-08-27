import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

// Shared page header — every page should use this so the eyebrow / title / description
// pattern is identical. Right-side action buttons go in `actions`. Optional `eyebrowIcon`
// and `eyebrow` render in violet-700 small text above the title.

export type PageHeaderProps = {
  eyebrow?: string;
  eyebrowIcon?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, eyebrowIcon, title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div>
        {eyebrow && (
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-700">
            {eyebrowIcon}
            {eyebrow}
          </div>
        )}
        <h1 className="text-[34px] font-semibold leading-tight tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// Small reusable empty-state for pages that have no data yet
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="grid min-h-72 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <div>
        {icon && <div className="mb-3 text-slate-400">{icon}</div>}
        <div className="font-medium text-slate-700">{title}</div>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

// Small reusable error banner
export function ErrorBanner({ error, onDismiss }: { error: string | null; onDismiss?: () => void }) {
  if (!error) return null;
  return (
    <div className="mb-4 flex items-start justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
      <span>{error}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-rose-500 hover:text-rose-700" aria-label="Dismiss error">×</button>
      )}
    </div>
  );
}

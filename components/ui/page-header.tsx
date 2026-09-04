import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type PageHeaderProps = { eyebrow?: string; eyebrowIcon?: ReactNode; title: string; description?: ReactNode; actions?: ReactNode; className?: string };

export function PageHeader({ eyebrow, eyebrowIcon, title, description, actions, className }: PageHeaderProps) {
  return <div className={cn("relative mb-8 border-b border-border pb-7 pt-8 sm:mb-10 sm:pb-9 sm:pt-11", className)}>
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <div className="signal-kicker mb-4">{eyebrowIcon}{eyebrow}</div>}
        <h1 className="text-[clamp(2.65rem,7vw,5.75rem)] font-semibold leading-[.82] tracking-[-0.07em] text-foreground">{title}<span className="text-[hsl(var(--claw-accent))]">.</span></h1>
        {description && <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
    <span className="absolute -bottom-px left-0 h-px w-28 bg-[hsl(var(--claw-accent))] shadow-[0_0_16px_hsl(var(--claw-accent))]" />
  </div>;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return <div className="signal-grid grid min-h-72 place-items-center rounded-xl border border-dashed border-[hsl(var(--border-strong))] bg-[hsl(var(--claw-elevated))]/50 p-8 text-center">
    <div>{icon && <div className="mb-4 text-[hsl(var(--claw-accent))]">{icon}</div>}<div className="font-semibold">{title}</div>{description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}{action && <div className="mt-5">{action}</div>}</div>
  </div>;
}

export function ErrorBanner({ error, onDismiss }: { error: string | null; onDismiss?: () => void }) {
  if (!error) return null;
  return <div className="mb-4 flex items-start justify-between gap-2 rounded-md border border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/10 p-3 text-sm text-[hsl(var(--danger))]">
    <span>{error}</span>{onDismiss && <button onClick={onDismiss} className="opacity-70 hover:opacity-100" aria-label="Dismiss error">×</button>}
  </div>;
}

import * as React from "react";
import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement> & { title?: React.ReactNode; actions?: React.ReactNode };

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, title, actions, children, ...props }, ref) => (
  <div ref={ref} className={cn("signal-panel min-w-0 rounded-xl p-5 text-foreground sm:p-6", className)} {...props}>
    {(title || actions) && <div className="mb-5 flex items-start justify-between gap-3 border-b border-border/70 pb-4">
      <div className="text-sm font-semibold tracking-[-0.01em]">{title}</div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>}
    {children}
  </div>
));
Card.displayName = "Card";

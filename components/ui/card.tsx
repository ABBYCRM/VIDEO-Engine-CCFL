import * as React from "react";
import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  title?: React.ReactNode;
  actions?: React.ReactNode;
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, title, actions, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("min-w-0 rounded-2xl border border-border bg-[hsl(var(--claw-elevated))] p-5 text-foreground", className)}
        {...props}
      >
        {(title || actions) && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="font-medium">{title}</div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        )}
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

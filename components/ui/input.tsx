import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-11 w-full rounded-md border border-border bg-background/65 px-3.5 text-sm text-foreground shadow-[inset_0_1px_0_hsl(var(--foreground)/.025)] outline-none transition placeholder:text-muted-foreground/70 hover:border-[hsl(var(--border-strong))] focus:border-[hsl(var(--claw-accent))]/65 focus:bg-[hsl(var(--claw-elevated))] focus:ring-2 focus:ring-[hsl(var(--claw-accent))]/12", className)} {...props} />
));
Input.displayName = "Input";

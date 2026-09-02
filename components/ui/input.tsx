import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-11 w-full rounded-xl border border-border bg-[hsl(var(--claw-elevated))] px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[hsl(var(--claw-accent))]/50 focus:ring-2 focus:ring-[hsl(var(--claw-accent))]/40", className)} {...props} />
));
Input.displayName = "Input";

import * as React from "react";
import { cn } from "@/lib/utils";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-3 text-sm outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400", className)} {...props} />
));
Input.displayName = "Input";

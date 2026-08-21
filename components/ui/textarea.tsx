import * as React from "react";
import { cn } from "@/lib/utils";
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn("min-h-28 w-full resize-y rounded-xl border border-slate-200 bg-white/80 p-3 text-sm outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-400", className)} {...props} />
));
Textarea.displayName = "Textarea";

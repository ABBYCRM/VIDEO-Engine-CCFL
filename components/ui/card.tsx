import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn("rounded-2xl border border-slate-800 bg-slate-950/60 shadow-2xl shadow-black/10 backdrop-blur", className)} {...props} />; }

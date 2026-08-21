import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400",
  { variants: { variant: {
    default: "bg-cyan-500 text-slate-950 hover:bg-cyan-300",
    secondary: "bg-slate-100 text-slate-100 hover:bg-slate-700",
    outline: "border border-slate-200 bg-transparent text-slate-100 hover:bg-slate-100",
    danger: "bg-red-500/15 text-red-300 hover:bg-red-500/25",
    ghost: "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-100"
  }, size: { default: "h-10 px-4", sm: "h-9 px-3", lg: "h-12 px-6" } }, defaultVariants: { variant: "default", size: "default" } }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
Button.displayName = "Button";

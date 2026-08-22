import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2",
  { variants: { variant: {
    default: "bg-violet-600 text-white shadow-sm hover:bg-violet-700 active:bg-violet-800",
    secondary: "border border-slate-200 bg-white text-slate-800 shadow-sm hover:bg-slate-100 hover:text-slate-950 active:bg-slate-200",
    outline: "border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950",
    danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950"
  }, size: { default: "h-10 px-4", sm: "h-9 px-3", lg: "h-12 px-6" } }, defaultVariants: { variant: "default", size: "default" } }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
Button.displayName = "Button";

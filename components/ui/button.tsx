import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex max-w-full min-w-0 items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-xl text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--claw-accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(var(--claw-elevated))]",
  { variants: { variant: {
    default: "bg-[hsl(var(--claw-accent))] text-[hsl(var(--claw-accent-fg))] shadow-sm hover:bg-[hsl(var(--claw-accent-hover))]",
    secondary: "border border-border bg-[hsl(var(--claw-elevated))] text-foreground shadow-sm hover:bg-muted",
    outline: "border border-border bg-transparent text-foreground hover:border-[hsl(var(--border-strong))] hover:bg-muted",
    danger: "border border-[hsl(var(--danger))]/30 bg-[hsl(var(--danger))]/10 text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/20",
    ghost: "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
  }, size: { default: "h-10 px-4", sm: "h-9 px-3", lg: "h-12 px-6" } }, defaultVariants: { variant: "default", size: "default" } }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
Button.displayName = "Button";

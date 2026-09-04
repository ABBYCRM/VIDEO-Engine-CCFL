import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex max-w-full min-w-0 items-center justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-md border text-xs font-semibold tracking-[0.01em] transition-all duration-200 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--claw-accent))]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px",
  { variants: { variant: {
    default: "border-[hsl(var(--claw-accent))] bg-[hsl(var(--claw-accent))] text-[hsl(var(--claw-accent-fg))] shadow-[0_8px_28px_hsl(var(--claw-accent)/.12)] hover:border-[hsl(var(--claw-accent-hover))] hover:bg-[hsl(var(--claw-accent-hover))] hover:shadow-[0_10px_34px_hsl(var(--claw-accent)/.2)]",
    secondary: "border-border bg-[hsl(var(--claw-elevated))] text-foreground hover:border-[hsl(var(--border-strong))] hover:bg-muted",
    outline: "border-border bg-transparent text-foreground hover:border-[hsl(var(--claw-accent))]/45 hover:bg-[hsl(var(--claw-accent))]/5",
    danger: "border-[hsl(var(--danger))]/35 bg-[hsl(var(--danger))]/10 text-[hsl(var(--danger))] hover:bg-[hsl(var(--danger))]/18",
    ghost: "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
  }, size: { default: "h-10 px-4", sm: "h-9 px-3", lg: "h-12 px-6 text-sm" } }, defaultVariants: { variant: "default", size: "default" } }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});
Button.displayName = "Button";

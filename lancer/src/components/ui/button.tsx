import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

const buttonVariants = cva(
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-[7px] px-3 text-[13px] font-medium transition-[background-color,opacity,color] duration-[var(--transition-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-105",
        secondary:
          "border border-border bg-surface-1 text-foreground hover:bg-surface-hover",
        ghost: "text-foreground hover:bg-surface-hover",
        outline: "border border-border bg-transparent hover:bg-surface-hover",
        danger:
          "border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5 text-xs",
        icon: "size-8 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size }), className)} type="button" {...props} />
  );
}

import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-muted-foreground",
        accent: "bg-accent-soft text-accent-foreground",
        success: "bg-success/10 text-success",
        warning: "bg-warning/15 text-warning",
        danger: "bg-destructive/10 text-destructive",
        info: "bg-info/10 text-info",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

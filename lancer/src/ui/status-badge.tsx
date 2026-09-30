import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "running";

const toneDot: Record<StatusTone, string> = {
  success: "bg-success",
  running: "bg-running",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

/** Soft status: prefer ● Running over bordered Tag spam (UI Spec §11). */
export function StatusBadge({
  tone = "neutral",
  label,
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone; label: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[12px] text-foreground", className)}
      {...props}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", toneDot[tone])} aria-hidden />
      {label}
    </span>
  );
}

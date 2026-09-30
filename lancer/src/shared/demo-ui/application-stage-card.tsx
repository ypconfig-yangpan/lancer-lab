import type { ReactNode } from "react";
import { StatusBadge, type StatusTone } from "@lancer/ui";

/** Compact stage body for Experience Slot contributions (Application Overview). */
export function ApplicationStageCard({
  provider,
  primary,
  secondary,
  tone = "info",
  extra,
}: {
  provider: string;
  primary: string;
  secondary?: string;
  tone?: StatusTone;
  extra?: ReactNode;
}) {
  return (
    <div className="space-y-1 text-[12px]">
      <div className="font-medium text-foreground">{provider}</div>
      <div className="font-mono text-[11px] text-foreground">{primary}</div>
      {secondary ? <StatusBadge tone={tone} label={secondary} /> : null}
      {extra}
    </div>
  );
}

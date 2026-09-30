import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, type StatusTone } from "./status-badge";

export function PageHeader({
  title,
  description,
  badge,
  status,
  statusTone = "success",
  actions,
  className,
}: {
  title: string;
  description?: string;
  badge?: string;
  status?: string;
  statusTone?: StatusTone;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex items-start justify-between gap-3 px-4 py-3", className)}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-[20px] font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {badge ? <Badge tone="accent">{badge}</Badge> : null}
          {status ? <StatusBadge tone={statusTone} label={status} /> : null}
        </div>
        {description ? (
          <p className="max-w-2xl text-[13px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

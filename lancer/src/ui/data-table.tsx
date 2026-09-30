import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

/** Shared table chrome — soft separators, selected soft blue (UI Spec §11). */
export function DataTableFrame({
  title,
  toolbar,
  children,
  className,
}: {
  title?: string;
  toolbar?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col bg-surface-1", className)}>
      {(title || toolbar) && (
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          {title ? (
            <div className="text-[13px] font-medium text-foreground">{title}</div>
          ) : null}
          <div className="ml-auto flex items-center gap-2">{toolbar}</div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  );
}

export function dataTableRowClass(selected: boolean): string {
  return cn(
    "cursor-pointer border-b border-border-subtle/80 transition-colors duration-[var(--transition-fast)] hover:bg-surface-hover",
    selected && "bg-surface-selected lancer-select-accent",
  );
}

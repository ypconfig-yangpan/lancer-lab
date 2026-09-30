import { Button, SearchInput } from "@lancer/ui";
import { useModuleSelectionStore } from "@/shell/presentation";
import { cn } from "@/shared/lib/utils";

const LEVEL_CLASS: Record<string, string> = {
  INFO: "text-log-info",
  WARN: "text-log-warning",
  ERROR: "text-log-error",
  DEBUG: "text-muted-foreground",
};

export interface MockLogLine {
  level: string;
  message: string;
}

/** Shared catalog-demo console for stub tool panes. */
export function MockConsolePane({
  moduleId,
  title,
  linesWhenSelected,
  emptyHint = "No Selection — pick a row",
  dark = false,
}: {
  moduleId: string;
  title: string;
  linesWhenSelected: (rowId: string) => MockLogLine[];
  emptyHint?: string;
  dark?: boolean;
}) {
  const selectedRowId = useModuleSelectionStore(
    (s) => s.byModule[moduleId]?.selectedRowId ?? null,
  );
  const lines =
    selectedRowId !== null
      ? linesWhenSelected(selectedRowId)
      : [{ level: "WARN", message: emptyHint }];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-2 py-1.5 shadow-[inset_0_-1px_0_0_var(--border-subtle)]">
        <Button variant="secondary" size="sm">
          Pause
        </Button>
        <Button variant="secondary" size="sm">
          Follow
        </Button>
        <SearchInput className="h-7 max-w-xs" placeholder="Search…" readOnly tabIndex={-1} />
        <div className="flex-1" />
        <span className="text-[11px] text-muted-foreground">
          {title}
          {selectedRowId ? ` · ${selectedRowId}` : ""}
        </span>
      </div>
      <div
        className={cn(
          "log-viewer min-h-0 flex-1 overflow-auto p-2",
          dark && "log-viewer--terminal",
        )}
      >
        {lines.map((line, index) => (
          <div key={`${line.level}-${index}`} className="flex gap-3 leading-5">
            <span className="shrink-0 opacity-60">12:0{index % 10}:0{index % 6}</span>
            <span
              className={cn(
                "w-12 shrink-0 font-semibold",
                LEVEL_CLASS[line.level] ?? "text-muted-foreground",
              )}
            >
              {line.level}
            </span>
            <span>{line.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

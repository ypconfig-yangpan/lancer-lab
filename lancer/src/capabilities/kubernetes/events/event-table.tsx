import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EventSummary } from "@/entities/event/types";
import { formatInstant } from "@/shared/lib/datetime";
import { cn } from "@/shared/lib/utils";

const columnHelper = createColumnHelper<EventSummary>();

interface EventTableProps {
  data: EventSummary[];
}

function formatOptionalInstant(value: string): string {
  if (value.length === 0) {
    return "—";
  }
  return formatInstant(value);
}

export function EventTable({ data }: EventTableProps) {
  const { t } = useTranslation();
  const [sorting, setSorting] = useState<SortingState>([{ id: "lastTimestamp", desc: true }]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("lastTimestamp", {
        header: t("event.columns.lastSeen"),
        cell: (info) => (
          <span className="font-mono text-[12px]">{formatOptionalInstant(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("eventType", {
        header: t("event.columns.type"),
        cell: (info) => {
          const value = info.getValue();
          const warning = value === "Warning";
          return <span className={cn(warning && "font-medium text-destructive")}>{value}</span>;
        },
      }),
      columnHelper.accessor("reason", {
        header: t("event.columns.reason"),
        cell: (info) => <span className="font-mono text-[12px]">{info.getValue()}</span>,
      }),
      columnHelper.accessor((row) => `${row.involvedKind}/${row.involvedName}`, {
        id: "object",
        header: t("event.columns.object"),
        cell: (info) => <span className="font-mono text-[12px]">{info.getValue()}</span>,
      }),
      columnHelper.accessor("message", {
        header: t("event.columns.message"),
        cell: (info) => (
          <span className="line-clamp-2 max-w-[40rem] text-[12px]">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("count", {
        header: t("event.columns.count"),
      }),
    ],
    [t],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-panel">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-panel-border">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      className="hover:text-foreground"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </button>
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-panel-border/60 hover:bg-accent/40">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-2 py-1.5 align-top">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

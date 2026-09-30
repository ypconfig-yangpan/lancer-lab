import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { dataTableRowClass } from "@lancer/ui";
import type { DeploymentSummary } from "@/entities/deployment/types";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import { formatInstant } from "@/shared/lib/datetime";
import { cn } from "@/shared/lib/utils";

const columnHelper = createColumnHelper<DeploymentSummary>();

interface DeploymentTableProps {
  data: DeploymentSummary[];
}

function isReadyHealthy(ready: string): boolean {
  const parts = ready.split("/");
  const a = Number.parseInt(parts[0] ?? "", 10);
  const b = Number.parseInt(parts[1] ?? "", 10);
  return Number.isFinite(a) && Number.isFinite(b) && a === b && b > 0;
}

export function DeploymentTable({ data }: DeploymentTableProps) {
  const { t } = useTranslation();
  const selectedId = useKubernetesWorkspaceStore((s) => s.selectedResourceId);
  const setSelectedId = useKubernetesWorkspaceStore((s) => s.setSelectedResourceId);
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: t("deployment.columns.name"),
        cell: (info) => (
          <span className="font-mono text-[12px] font-medium">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("ready", {
        id: "status",
        header: t("deployment.columns.status", { defaultValue: "Status" }),
        cell: (info) => {
          const healthy = isReadyHealthy(info.getValue());
          return (
            <span className="inline-flex items-center gap-1.5 text-[12px]">
              <span
                className={cn("size-1.5 rounded-full", healthy ? "bg-success" : "bg-warning")}
                aria-hidden
              />
              {healthy ? "Running" : "Degraded"}
            </span>
          );
        },
      }),
      columnHelper.accessor("ready", {
        header: t("deployment.columns.ready"),
        cell: (info) => (
          <span
            className={cn(
              "rounded-[4px] px-1.5 py-0.5 font-mono text-[11px]",
              isReadyHealthy(info.getValue())
                ? "bg-success/10 text-success"
                : "bg-warning/10 text-warning",
            )}
          >
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("image", {
        header: t("deployment.columns.image"),
        cell: (info) => (
          <span className="max-w-[200px] truncate font-mono text-[11px]" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor("createdAt", {
        header: t("deployment.columns.created"),
        cell: (info) => (
          <span className="text-[12px] text-muted-foreground">
            {formatInstant(info.getValue())}
          </span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: () => (
          <span className="inline-flex size-7 items-center justify-center rounded-[6px] text-muted-foreground">
            <MoreHorizontal className="size-4" />
          </span>
        ),
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
    <table className="w-full border-collapse text-left text-[13px]">
      <thead className="sticky top-0 z-10 bg-surface-1">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id} className="border-b border-border-subtle">
            {headerGroup.headers.map((header) => (
              <th
                key={header.id}
                className="h-9 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {header.isPlaceholder || header.column.id === "actions" ? null : (
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
        {table.getRowModel().rows.map((row) => {
          const selected = row.original.uid === selectedId;
          return (
            <tr
              key={row.id}
              className={dataTableRowClass(selected)}
              onClick={() => setSelectedId(row.original.uid)}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="h-11 px-3 align-middle">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

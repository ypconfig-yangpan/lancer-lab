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
import { Button, dataTableRowClass } from "@lancer/ui";
import type { ServiceSummary } from "@/entities/service/types";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import { formatInstant } from "@/shared/lib/datetime";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";

const columnHelper = createColumnHelper<ServiceSummary>();

interface ServiceTableProps {
  data: ServiceSummary[];
}

export function ServiceTable({ data }: ServiceTableProps) {
  const { t } = useTranslation();
  const selectedId = useKubernetesWorkspaceStore((s) => s.selectedResourceId);
  const setSelectedId = useKubernetesWorkspaceStore((s) => s.setSelectedResourceId);
  const setActiveBottomViewId = useWorkspaceStore((s) => s.setActiveBottomViewId);
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: t("service.columns.name"),
        cell: (info) => <span className="font-mono text-[12px]">{info.getValue()}</span>,
      }),
      columnHelper.accessor("namespace", {
        header: t("service.columns.namespace"),
      }),
      columnHelper.accessor("serviceType", {
        header: t("service.columns.type"),
      }),
      columnHelper.accessor("clusterIp", {
        header: t("service.columns.clusterIp"),
        cell: (info) => <span className="font-mono text-[12px]">{info.getValue()}</span>,
      }),
      columnHelper.accessor("ports", {
        header: t("service.columns.ports"),
      }),
      columnHelper.accessor("createdAt", {
        header: t("service.columns.created"),
        cell: (info) => (
          <span className="text-muted-foreground">{formatInstant(info.getValue())}</span>
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        cell: (info) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                setSelectedId(info.row.original.uid);
                setActiveBottomViewId("kubernetes.logs");
              }}
            >
              {t("explorer.openLogs")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                setSelectedId(info.row.original.uid);
                setActiveBottomViewId("kubernetes.exec");
              }}
            >
              {t("explorer.openExec")}
            </Button>
          </div>
        ),
      }),
    ],
    [setActiveBottomViewId, setSelectedId, t],
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
                {header.isPlaceholder ? null : header.column.id === "actions" ? null : (
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
              onDoubleClick={() => {
                setSelectedId(row.original.uid);
                setActiveBottomViewId("kubernetes.logs");
              }}
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

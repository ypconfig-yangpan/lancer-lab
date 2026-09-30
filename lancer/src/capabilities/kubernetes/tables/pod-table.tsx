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
import type { PodSummary } from "@/entities/pod/types";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import { PodPhaseBadge } from "@/capabilities/kubernetes/tables/pod-phase-badge";
import { formatInstant } from "@/shared/lib/datetime";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";

const columnHelper = createColumnHelper<PodSummary>();

interface PodTableProps {
  data: PodSummary[];
}

export function PodTable({ data }: PodTableProps) {
  const { t } = useTranslation();
  const selectedPodId = useKubernetesWorkspaceStore((s) => s.selectedResourceId);
  const setSelectedPodId = useKubernetesWorkspaceStore((s) => s.setSelectedResourceId);
  const setActiveBottomViewId = useWorkspaceStore((s) => s.setActiveBottomViewId);
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: t("pod.columns.name"),
        cell: (info) => <span className="font-mono text-[12px]">{info.getValue()}</span>,
      }),
      columnHelper.accessor("namespace", {
        header: t("pod.columns.namespace"),
      }),
      columnHelper.accessor("phase", {
        header: t("pod.columns.phase"),
        cell: (info) => <PodPhaseBadge phase={info.getValue()} />,
      }),
      columnHelper.accessor("ready", {
        header: t("pod.columns.ready"),
        cell: (info) => <span className="font-mono text-[12px]">{info.getValue()}</span>,
      }),
      columnHelper.accessor("restarts", {
        header: t("pod.columns.restarts"),
      }),
      columnHelper.accessor("nodeName", {
        header: t("pod.columns.node"),
        cell: (info) => <span className="font-mono text-[12px]">{info.getValue()}</span>,
      }),
      columnHelper.accessor("createdAt", {
        header: t("pod.columns.created"),
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
                setSelectedPodId(info.row.original.uid);
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
                setSelectedPodId(info.row.original.uid);
                setActiveBottomViewId("kubernetes.exec");
              }}
            >
              {t("explorer.openExec")}
            </Button>
          </div>
        ),
      }),
    ],
    [setActiveBottomViewId, setSelectedPodId, t],
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
          const selected = row.original.uid === selectedPodId;
          return (
            <tr
              key={row.id}
              className={dataTableRowClass(selected)}
              onClick={() => {
                setSelectedPodId(row.original.uid);
              }}
              onDoubleClick={() => {
                setSelectedPodId(row.original.uid);
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

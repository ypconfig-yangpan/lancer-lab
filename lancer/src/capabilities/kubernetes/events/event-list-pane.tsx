import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import {
  useDeployments,
  useEvents,
  usePods,
  useServices,
} from "@/capabilities/kubernetes/connect/use-cluster-connection";
import { useResourceWatch } from "@/capabilities/kubernetes/connect/use-resource-watch";
import { EventTable } from "@/capabilities/kubernetes/events/event-table";
import { formatAppError } from "@/shared/lib/app-error";

interface EventListPaneProps {
  /** Lazy: only fetch while the Events bottom tab is visible. */
  enabled: boolean;
}

export function EventListPane({ enabled }: EventListPaneProps) {
  const { t } = useTranslation();
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);
  const kind = useKubernetesWorkspaceStore((s) => s.resourceListKind);
  const selectedId = useKubernetesWorkspaceStore((s) => s.selectedResourceId);
  const query = useEvents(clusterId, namespace, { enabled });
  const podsQuery = usePods(clusterId, namespace, {
    enabled: enabled && kind === "pod" && selectedId !== null,
  });
  const deploymentsQuery = useDeployments(clusterId, namespace, {
    enabled: enabled && kind === "deployment" && selectedId !== null,
  });
  const servicesQuery = useServices(clusterId, namespace, {
    enabled: enabled && kind === "service" && selectedId !== null,
  });

  const selectedName = useMemo(() => {
    if (selectedId === null) {
      return null;
    }
    if (kind === "pod") {
      return podsQuery.data?.find((p) => p.uid === selectedId)?.name ?? null;
    }
    if (kind === "deployment") {
      return deploymentsQuery.data?.find((d) => d.uid === selectedId)?.name ?? null;
    }
    return servicesQuery.data?.find((s) => s.uid === selectedId)?.name ?? null;
  }, [deploymentsQuery.data, kind, podsQuery.data, selectedId, servicesQuery.data]);

  const involvedKind =
    kind === "pod" ? "Pod" : kind === "deployment" ? "Deployment" : kind === "service" ? "Service" : null;

  const rows = useMemo(() => {
    const all = query.data ?? [];
    if (selectedName === null || involvedKind === null) {
      return all;
    }
    return all.filter(
      (e) =>
        e.involvedName === selectedName ||
        (e.involvedKind === involvedKind && e.involvedName === selectedName) ||
        e.message.includes(selectedName),
    );
  }, [involvedKind, query.data, selectedName]);

  const isEmpty = rows.length === 0;

  useResourceWatch(clusterId, namespace, "event", enabled && clusterId !== null);

  if (clusterId === null) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-muted-foreground">
        {t("workspace.selectCluster")}
      </div>
    );
  }

  if (query.isLoading && (query.data ?? []).length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        {t("bottom.loadingEvents")}
      </div>
    );
  }

  if (query.isError && (query.data ?? []).length === 0) {
    const err = formatAppError(query.error);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[13px]">
        <p className="text-destructive">
          {err.code}: {err.message}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t("workspace.refresh")}
        </Button>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[13px] text-muted-foreground">
        <p>
          {selectedName
            ? `No events for ${involvedKind}/${selectedName}`
            : t("bottom.emptyEvents", { namespace })}
        </p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t("workspace.refresh")}
        </Button>
      </div>
    );
  }

  const staleError = query.isError ? formatAppError(query.error) : null;

  return (
    <div className="flex h-full flex-col">
      {selectedName ? (
        <div className="flex items-center gap-2 border-b border-border-subtle px-2 py-1 text-[11px] text-muted-foreground">
          Filtered · {involvedKind}/{selectedName}
          <span className="text-foreground">{rows.length}</span>
        </div>
      ) : null}
      {staleError ? (
        <div className="flex items-center justify-between gap-2 border-b border-panel-border px-2 py-1 text-[11px] text-destructive">
          <span>
            {staleError.code}: {staleError.message}
          </span>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t("workspace.refresh")}
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <EventTable data={rows} />
      </div>
    </div>
  );
}

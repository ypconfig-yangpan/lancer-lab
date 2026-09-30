import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Box, ChevronDown, Pencil } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button, InspectorSection, PageTabs, PropertyList, StatusBadge } from "@lancer/ui";
import type { DeploymentSummary } from "@/entities/deployment/types";
import type { PodSummary } from "@/entities/pod/types";
import type { ServiceSummary } from "@/entities/service/types";
import type { ManifestResourceKind } from "@/entities/yaml/types";
import {
  type ResourceListKind,
  useKubernetesWorkspaceStore,
} from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import {
  useDeployments,
  useEvents,
  usePods,
  useServices,
} from "@/capabilities/kubernetes/connect/use-cluster-connection";
import {
  DeploymentRestartButton,
  DeploymentWriteActions,
} from "@/capabilities/kubernetes/ops/deployment-write-actions";
import { PodQuickActions } from "@/capabilities/kubernetes/ops/pod-quick-actions";
import { KubernetesInspectorConsole } from "@/capabilities/kubernetes/tables/kubernetes-inspector-console";
import { PodPhaseBadge } from "@/capabilities/kubernetes/tables/pod-phase-badge";
import {
  type InspectorDetailTab,
  ResourceYamlPane,
} from "@/capabilities/kubernetes/tables/resource-yaml-pane";
import { useHostModuleId, useReportInspectorSelection } from "@/shell";
import { formatInstant } from "@/shared/lib/datetime";
import { cn } from "@/shared/lib/utils";

function toManifestKind(kind: ResourceListKind): ManifestResourceKind {
  return kind;
}

function imageVersion(image: string): string {
  const i = image.lastIndexOf(":");
  if (i <= 0) {
    return image || "—";
  }
  return image.slice(i + 1) || "—";
}

function isReadyHealthy(ready: string): boolean {
  const parts = ready.split("/");
  const a = Number.parseInt(parts[0] ?? "", 10);
  const b = Number.parseInt(parts[1] ?? "", 10);
  return Number.isFinite(a) && Number.isFinite(b) && a === b && b > 0;
}

/**
 * Design-spec detail page: header · Overview cards · Events · Logs|Terminal.
 */
export function ResourceInspector() {
  const { t } = useTranslation();
  const moduleId = useHostModuleId() ?? "kubernetes";
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const cluster = useKubernetesWorkspaceStore((s) => s.activeCluster);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);
  const kind = useKubernetesWorkspaceStore((s) => s.resourceListKind);
  const selectedId = useKubernetesWorkspaceStore((s) => s.selectedResourceId);
  const [tab, setTab] = useState<InspectorDetailTab>("summary");
  const [moreOpen, setMoreOpen] = useState(false);
  useReportInspectorSelection(moduleId, selectedId !== null);

  const podsQuery = usePods(clusterId, namespace, { enabled: kind === "pod" });
  const deploymentsQuery = useDeployments(clusterId, namespace, {
    enabled: kind === "deployment",
  });
  const servicesQuery = useServices(clusterId, namespace, { enabled: kind === "service" });

  if (clusterId === null || selectedId === null) {
    return (
      <div className="flex h-full items-center justify-center px-3 text-[13px] text-muted-foreground">
        {t("detail.noSelection")}
      </div>
    );
  }

  let name: string | null = null;
  let summary: ReactNode = <EmptyDetail />;
  let headerStatus: ReactNode = null;
  let headerActions: ReactNode = null;
  let headerMeta: ReactNode = null;
  let deployment: DeploymentSummary | null = null;

  if (kind === "pod") {
    const pod = (podsQuery.data ?? []).find((item) => item.uid === selectedId) ?? null;
    if (pod) {
      name = pod.name;
      summary = <PodDetail pod={pod} />;
      headerStatus = <PodPhaseBadge phase={pod.phase} />;
      headerMeta = (
        <MetaLine
          items={[
            { label: "Namespace", value: pod.namespace },
            { label: "Node", value: pod.nodeName || "—" },
            { label: "Created", value: formatInstant(pod.createdAt) },
          ]}
        />
      );
    }
  } else if (kind === "deployment") {
    deployment =
      (deploymentsQuery.data ?? []).find((item) => item.uid === selectedId) ?? null;
    if (deployment) {
      name = deployment.name;
      summary = (
        <DeploymentDetail
          deployment={deployment}
          showWriteActions={moreOpen}
          onCloseWrite={() => setMoreOpen(false)}
        />
      );
      headerStatus = (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
            isReadyHealthy(deployment.ready)
              ? "bg-success/15 text-success"
              : "bg-warning/15 text-warning",
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              isReadyHealthy(deployment.ready) ? "bg-success" : "bg-warning",
            )}
          />
          {isReadyHealthy(deployment.ready) ? "Running" : "Degraded"}
        </span>
      );
      headerActions =
        cluster !== null ? (
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setTab("yaml")}
            >
              <Pencil className="size-3.5" />
              Edit YAML
            </Button>
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                className="gap-1"
                onClick={() => setMoreOpen((v) => !v)}
              >
                More
                <ChevronDown className="size-3.5 opacity-70" />
              </Button>
            </div>
            <DeploymentRestartButton cluster={cluster} deployment={deployment} />
          </div>
        ) : null;
      headerMeta = (
        <MetaLine
          items={[
            { label: "Namespace", value: deployment.namespace },
            { label: "Image", value: deployment.image || "—", mono: true },
            { label: "Created", value: formatInstant(deployment.createdAt) },
          ]}
        />
      );
    }
  } else {
    const service = (servicesQuery.data ?? []).find((item) => item.uid === selectedId) ?? null;
    if (service) {
      name = service.name;
      summary = <ServiceDetail service={service} />;
      headerStatus = <StatusBadge tone="neutral" label={service.serviceType} />;
      headerMeta = (
        <MetaLine
          items={[
            { label: "Namespace", value: service.namespace },
            { label: "ClusterIP", value: service.clusterIp, mono: true },
          ]}
        />
      );
    }
  }

  if (name === null) {
    return <EmptyDetail />;
  }

  return (
    <div className="flex h-full flex-col bg-surface-1" key={`${kind}:${selectedId}`}>
      <div className="flex shrink-0 items-start gap-3 border-b border-border-subtle px-4 py-3.5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
          <Box className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="min-w-0 truncate text-[18px] font-semibold tracking-tight">
              {name}
            </div>
            {headerStatus}
          </div>
          {headerMeta}
        </div>
        {headerActions}
      </div>

      <PanelGroup
        direction="vertical"
        className="min-h-0 flex-1"
        autoSaveId="lancer.k8s.inspector-detail-console.v2"
      >
        <Panel defaultSize={55} minSize={32} id="k8s-inspector-main">
          <div className="flex h-full min-h-0 flex-col">
            <PageTabs
              value={tab}
              onChange={(id) => setTab(id as InspectorDetailTab)}
              items={[
                { id: "summary", label: t("detail.tabs.overview") },
                { id: "pods", label: "Pods", disabled: true },
                { id: "logs", label: "Logs", disabled: true },
                { id: "events", label: t("bottom.events"), disabled: true },
                { id: "metrics", label: "Metrics", disabled: true },
                { id: "config", label: "Configuration", disabled: true },
                { id: "yaml", label: t("detail.tabs.yaml") },
              ]}
              className="shrink-0 px-3"
            />
            <div className="min-h-0 flex-1 overflow-auto bg-surface-2/40">
              {tab === "summary" ? (
                summary
              ) : (
                <ResourceYamlPane
                  clusterId={clusterId}
                  namespace={namespace}
                  kind={toManifestKind(kind)}
                  name={name}
                />
              )}
            </div>
          </div>
        </Panel>
        <PanelResizeHandle className="h-px bg-border-subtle hover:bg-primary/30" />
        <Panel defaultSize={45} minSize={24} id="k8s-inspector-console">
          <KubernetesInspectorConsole />
        </Panel>
      </PanelGroup>
    </div>
  );
}

function MetaLine({
  items,
}: {
  items: { label: string; value: string; mono?: boolean }[];
}) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12px] text-muted-foreground">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span>{item.label}:</span>
          <span
            className={cn(
              "text-foreground/85",
              item.mono && "max-w-[220px] truncate font-mono text-[11px]",
            )}
            title={item.value}
          >
            {item.value}
          </span>
        </span>
      ))}
    </div>
  );
}

function EmptyDetail() {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center px-3 text-[13px] text-muted-foreground">
      {t("detail.empty")}
    </div>
  );
}

function PodDetail({ pod }: { pod: PodSummary }) {
  const { t } = useTranslation();
  return (
    <div className="p-1">
      <PodQuickActions />
      <InspectorSection title={t("detail.title")}>
        <PropertyList
          items={[
            {
              label: t("pod.columns.name"),
              value: <span className="font-mono text-[12px]">{pod.name}</span>,
            },
            { label: t("pod.columns.namespace"), value: pod.namespace },
            { label: t("pod.columns.phase"), value: <PodPhaseBadge phase={pod.phase} /> },
            { label: t("pod.columns.ready"), value: pod.ready },
            { label: t("pod.columns.restarts"), value: String(pod.restarts) },
            {
              label: t("pod.columns.node"),
              value: <span className="font-mono text-[12px]">{pod.nodeName}</span>,
            },
            { label: t("pod.columns.created"), value: formatInstant(pod.createdAt) },
          ]}
        />
      </InspectorSection>
    </div>
  );
}

function DeploymentDetail({
  deployment,
  showWriteActions,
  onCloseWrite,
}: {
  deployment: DeploymentSummary;
  showWriteActions: boolean;
  onCloseWrite: () => void;
}) {
  const { t } = useTranslation();
  const cluster = useKubernetesWorkspaceStore((s) => s.activeCluster);
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const eventsQuery = useEvents(clusterId, deployment.namespace, { enabled: clusterId !== null });

  const recentEvents = useMemo(() => {
    const all = eventsQuery.data ?? [];
    return all
      .filter(
        (e) =>
          e.involvedName === deployment.name ||
          (e.involvedKind === "Deployment" && e.involvedName === deployment.name) ||
          e.message.includes(deployment.name),
      )
      .slice(0, 10);
  }, [deployment.name, eventsQuery.data]);

  return (
    <div className="space-y-3 p-3">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <OverviewCard
          label="Replicas"
          value={deployment.ready}
          emphasize
        />
        <OverviewCard label="Desired" value={String(deployment.replicas)} />
        <OverviewCard label="Available" value={String(deployment.available)} />
        <OverviewCard label="Version" value={imageVersion(deployment.image)} mono />
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <MetricPlaceholder label="CPU" hint="No metrics API" />
        <MetricPlaceholder label="Memory" hint="No metrics API" />
        <MetricPlaceholder label="Network" hint="No metrics API" />
      </div>

      {cluster && showWriteActions ? (
        <div className="rounded-[8px] border border-border-subtle bg-surface-1 p-2">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[12px] font-medium">{t("deployment.write.title")}</span>
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={onCloseWrite}
            >
              {t("deployment.write.cancel")}
            </button>
          </div>
          <DeploymentWriteActions cluster={cluster} deployment={deployment} hideRestart />
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[8px] border border-border-subtle bg-surface-1">
        <div className="border-b border-border-subtle px-3 py-2 text-[12px] font-semibold">
          Recent Events
        </div>
        {recentEvents.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-muted-foreground">
            {eventsQuery.isLoading ? t("workspace.loading") : "—"}
          </p>
        ) : (
          <table className="w-full border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Time</th>
                <th className="px-3 py-1.5 font-semibold">Type</th>
                <th className="px-3 py-1.5 font-semibold">Reason</th>
                <th className="px-3 py-1.5 font-semibold">Message</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.map((ev) => (
                <tr key={ev.uid} className="border-b border-border-subtle/80">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-muted-foreground">
                    {formatInstant(ev.lastTimestamp)}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium",
                        ev.eventType === "Warning"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-success/10 text-success",
                      )}
                    >
                      {ev.eventType}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{ev.reason}</td>
                  <td className="max-w-[240px] truncate px-3 py-2 text-muted-foreground" title={ev.message}>
                    {ev.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function OverviewCard({
  label,
  value,
  mono,
  emphasize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-[8px] border border-border-subtle bg-surface-1 px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 truncate font-semibold tracking-tight",
          emphasize ? "text-[20px] text-primary" : "text-[16px]",
          mono && "font-mono text-[14px]",
        )}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function MetricPlaceholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-[8px] border border-dashed border-border-subtle bg-surface-1 px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground">—</span>
      </div>
      <div className="mt-3 h-8 rounded-[4px] bg-gradient-to-r from-primary/10 via-primary/5 to-transparent" />
      <p className="mt-2 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function ServiceDetail({ service }: { service: ServiceSummary }) {
  const { t } = useTranslation();
  return (
    <div>
      <InspectorSection title={t("detail.title")}>
        <PropertyList
          items={[
            {
              label: t("service.columns.name"),
              value: <span className="font-mono text-[12px]">{service.name}</span>,
            },
            { label: t("service.columns.namespace"), value: service.namespace },
            { label: t("service.columns.type"), value: service.serviceType },
            {
              label: t("service.columns.clusterIp"),
              value: <span className="font-mono text-[12px]">{service.clusterIp}</span>,
            },
            {
              label: t("service.columns.ports"),
              value: <span className="font-mono text-[12px]">{service.ports}</span>,
            },
            { label: t("service.columns.created"), value: formatInstant(service.createdAt) },
          ]}
        />
      </InspectorSection>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus } from "lucide-react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import {
  Button,
  DataTableFrame,
  PageTabs,
  SearchInput,
} from "@lancer/ui";
import type { DeploymentSummary } from "@/entities/deployment/types";
import type { PodSummary } from "@/entities/pod/types";
import type { ServiceSummary } from "@/entities/service/types";
import {
  type ResourceListKind,
  useKubernetesWorkspaceStore,
} from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import { deploymentKeys, podKeys, serviceKeys } from "@/capabilities/kubernetes/connect/query-keys";
import {
  useDeployments,
  useNamespaces,
  usePods,
  useServices,
} from "@/capabilities/kubernetes/connect/use-cluster-connection";
import { useResourceWatch } from "@/capabilities/kubernetes/connect/use-resource-watch";
import { podMatchesSelector } from "@/capabilities/kubernetes/logs/resolve-backing-pods";
import { PodTable } from "@/capabilities/kubernetes/tables/pod-table";
import { DeploymentTable } from "@/capabilities/kubernetes/tables/deployment-table";
import { ResourceQueryGate } from "@/capabilities/kubernetes/tables/resource-query-gate";
import { ServiceTable } from "@/capabilities/kubernetes/tables/service-table";
import { PodPhaseBadge } from "@/capabilities/kubernetes/tables/pod-phase-badge";
import { cn } from "@/shared/lib/utils";

const KINDS: ResourceListKind[] = ["deployment", "pod", "service"];

const COMING_SOON_TABS = [
  { id: "statefulset", label: "StatefulSets" },
  { id: "daemonset", label: "DaemonSets" },
  { id: "job", label: "Jobs" },
  { id: "cronjob", label: "CronJobs" },
] as const;

function matchesQuery(haystack: string, q: string): boolean {
  return q.length === 0 || haystack.toLowerCase().includes(q);
}

/** Design-spec master list: Kubernetes header · kind tabs · deploy + related pods. */
export function ResourceListPane() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const cluster = useKubernetesWorkspaceStore((s) => s.activeCluster);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);
  const setNamespace = useKubernetesWorkspaceStore((s) => s.setNamespace);
  const kind = useKubernetesWorkspaceStore((s) => s.resourceListKind);
  const setKind = useKubernetesWorkspaceStore((s) => s.setResourceListKind);
  const selectedId = useKubernetesWorkspaceStore((s) => s.selectedResourceId);
  const setSelectedId = useKubernetesWorkspaceStore((s) => s.setSelectedResourceId);
  const [filter, setFilter] = useState("");
  const namespacesQuery = useNamespaces(clusterId);

  const needRelatedPods = kind === "deployment" && selectedId !== null;
  const podsQuery = usePods(clusterId, namespace, {
    enabled: kind === "pod" || needRelatedPods,
  });
  const deploymentsQuery = useDeployments(clusterId, namespace, {
    enabled: kind === "deployment",
  });
  const servicesQuery = useServices(clusterId, namespace, { enabled: kind === "service" });

  useResourceWatch(clusterId, namespace, kind, clusterId !== null);
  useResourceWatch(clusterId, namespace, "pod", needRelatedPods && clusterId !== null);

  const q = filter.trim().toLowerCase();
  const pods = useMemo(
    () => (podsQuery.data ?? []).filter((p) => matchesQuery(`${p.name} ${p.namespace}`, q)),
    [podsQuery.data, q],
  );
  const deployments = useMemo(
    () =>
      (deploymentsQuery.data ?? []).filter((d) => matchesQuery(`${d.name} ${d.namespace}`, q)),
    [deploymentsQuery.data, q],
  );
  const services = useMemo(
    () => (servicesQuery.data ?? []).filter((s) => matchesQuery(`${s.name} ${s.namespace}`, q)),
    [servicesQuery.data, q],
  );

  const selectedDeployment: DeploymentSummary | null = useMemo(() => {
    if (kind !== "deployment" || selectedId === null) {
      return null;
    }
    return deploymentsQuery.data?.find((d) => d.uid === selectedId) ?? null;
  }, [deploymentsQuery.data, kind, selectedId]);

  const relatedPods: PodSummary[] = useMemo(() => {
    if (!selectedDeployment) {
      return [];
    }
    return (podsQuery.data ?? []).filter((p) =>
      podMatchesSelector(p, selectedDeployment.matchLabels),
    );
  }, [podsQuery.data, selectedDeployment]);

  const count =
    kind === "pod" ? pods.length : kind === "deployment" ? deployments.length : services.length;

  const nsOptions = namespacesQuery.data ?? [];
  const nsSelectOptions =
    namespace.length === 0 || nsOptions.includes(namespace)
      ? nsOptions
      : [namespace, ...nsOptions];

  const refresh = () => {
    if (clusterId === null) return;
    if (kind === "pod") {
      void queryClient.invalidateQueries({ queryKey: podKeys.list(clusterId, namespace) });
    } else if (kind === "deployment") {
      void queryClient.invalidateQueries({
        queryKey: deploymentKeys.list(clusterId, namespace),
      });
      void queryClient.invalidateQueries({ queryKey: podKeys.list(clusterId, namespace) });
    } else {
      void queryClient.invalidateQueries({ queryKey: serviceKeys.list(clusterId, namespace) });
    }
  };

  const openRelatedPod = (pod: PodSummary) => {
    setKind("pod");
    setSelectedId(pod.uid);
  };

  return (
    <div className="flex h-full flex-col bg-surface-1">
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">
              Kubernetes
            </h1>
            {cluster ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-2 px-2.5 py-0.5 text-[12px] text-foreground">
                <span className="size-1.5 rounded-full bg-success" aria-hidden />
                <span className="max-w-[160px] truncate font-mono">{cluster.displayName}</span>
              </span>
            ) : (
              <span className="text-[12px] text-muted-foreground">{t("cluster.disconnected")}</span>
            )}
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={refresh} disabled={clusterId === null}>
          {t("workspace.refresh")}
        </Button>
      </div>

      <PageTabs
        value={kind}
        onChange={(id) => setKind(id as ResourceListKind)}
        className="px-4"
        items={[
          ...KINDS.map((item) => ({
            id: item,
            label: t(`workspace.kinds.${item}`),
          })),
          ...COMING_SOON_TABS.map((item) => ({
            id: item.id,
            label: item.label,
            disabled: true,
          })),
        ]}
      />

      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-2">
        <select
          className="h-8 min-w-[120px] rounded-[7px] border border-border bg-surface-1 px-2 text-[12px]"
          value={namespace}
          disabled={clusterId === null}
          onChange={(e) => setNamespace(e.target.value)}
          aria-label={t("sidebar.namespace")}
        >
          {nsSelectOptions.length === 0 ? (
            <option value={namespace}>{namespace || "—"}</option>
          ) : (
            nsSelectOptions.map((ns) => (
              <option key={ns} value={ns}>
                {ns}
              </option>
            ))
          )}
        </select>
        <SearchInput
          className="h-8 w-52"
          placeholder={t("workspace.searchPlaceholder")}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">{count}</span>
        <Button
          size="sm"
          className="gap-1"
          disabled
          title={t("explorer.comingSoon")}
        >
          <Plus className="size-3.5" />
          Create
          <ChevronDown className="size-3 opacity-70" />
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {kind === "deployment" && selectedDeployment ? (
          <PanelGroup
            direction="vertical"
            className="h-full"
            autoSaveId="lancer.k8s.deploy-master-detail.design.v2"
          >
            <Panel defaultSize={55} minSize={30} id="k8s-deploy-list">
              <ResourceListBody
                kind={kind}
                clusterId={clusterId}
                namespace={namespace}
                pods={pods}
                deployments={deployments}
                services={services}
                podsQuery={podsQuery}
                deploymentsQuery={deploymentsQuery}
                servicesQuery={servicesQuery}
              />
            </Panel>
            <PanelResizeHandle className="h-px bg-border-subtle hover:bg-primary/30" />
            <Panel defaultSize={45} minSize={24} id="k8s-related-pods">
              <RelatedPodsPane
                deployment={selectedDeployment}
                pods={relatedPods}
                loading={podsQuery.isLoading}
                onOpenPod={openRelatedPod}
              />
            </Panel>
          </PanelGroup>
        ) : (
          <ResourceListBody
            kind={kind}
            clusterId={clusterId}
            namespace={namespace}
            pods={pods}
            deployments={deployments}
            services={services}
            podsQuery={podsQuery}
            deploymentsQuery={deploymentsQuery}
            servicesQuery={servicesQuery}
          />
        )}
      </div>
    </div>
  );
}

function ResourceListBody({
  kind,
  clusterId,
  namespace,
  pods,
  deployments,
  services,
  podsQuery,
  deploymentsQuery,
  servicesQuery,
}: {
  kind: ResourceListKind;
  clusterId: string | null;
  namespace: string;
  pods: PodSummary[];
  deployments: DeploymentSummary[];
  services: ServiceSummary[];
  podsQuery: ReturnType<typeof usePods>;
  deploymentsQuery: ReturnType<typeof useDeployments>;
  servicesQuery: ReturnType<typeof useServices>;
}) {
  return (
    <DataTableFrame className="h-full min-h-0">
      {kind === "pod" ? (
        <ResourceQueryGate
          clusterId={clusterId}
          namespace={namespace}
          isLoading={podsQuery.isLoading}
          isError={podsQuery.isError}
          error={podsQuery.error}
          isEmpty={(podsQuery.data ?? []).length === 0}
          emptyKey="workspace.emptyPods"
          onRefresh={() => void podsQuery.refetch()}
        >
          <PodTable data={pods} />
        </ResourceQueryGate>
      ) : null}
      {kind === "deployment" ? (
        <ResourceQueryGate
          clusterId={clusterId}
          namespace={namespace}
          isLoading={deploymentsQuery.isLoading}
          isError={deploymentsQuery.isError}
          error={deploymentsQuery.error}
          isEmpty={(deploymentsQuery.data ?? []).length === 0}
          emptyKey="workspace.emptyDeployments"
          onRefresh={() => void deploymentsQuery.refetch()}
        >
          <DeploymentTable data={deployments} />
        </ResourceQueryGate>
      ) : null}
      {kind === "service" ? (
        <ResourceQueryGate
          clusterId={clusterId}
          namespace={namespace}
          isLoading={servicesQuery.isLoading}
          isError={servicesQuery.isError}
          error={servicesQuery.error}
          isEmpty={(servicesQuery.data ?? []).length === 0}
          emptyKey="workspace.emptyServices"
          onRefresh={() => void servicesQuery.refetch()}
        >
          <ServiceTable data={services} />
        </ResourceQueryGate>
      ) : null}
    </DataTableFrame>
  );
}

function RelatedPodsPane({
  deployment,
  pods,
  loading,
  onOpenPod,
}: {
  deployment: DeploymentSummary;
  pods: PodSummary[];
  loading: boolean;
  onOpenPod: (pod: PodSummary) => void;
}) {
  const { t } = useTranslation();
  const [podFilter, setPodFilter] = useState("");
  const q = podFilter.trim().toLowerCase();
  const filtered = useMemo(
    () => pods.filter((p) => matchesQuery(`${p.name} ${p.nodeName}`, q)),
    [pods, q],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-4">
        <span className="text-[13px] font-semibold text-foreground">
          Pods <span className="font-mono text-muted-foreground">({pods.length})</span>
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">
          {deployment.name}
        </span>
        <SearchInput
          className="ml-auto h-7 w-40"
          placeholder={t("workspace.searchPlaceholder")}
          value={podFilter}
          onChange={(e) => setPodFilter(e.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-4 text-[12px] text-muted-foreground">
            {loading ? t("workspace.loading") : t("workspace.noRelatedPods")}
          </p>
        ) : (
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-10 bg-surface-1">
              <tr className="border-b border-border-subtle">
                {["Name", "Status", "Ready", "Restarts", "Node"].map((h) => (
                  <th
                    key={h}
                    className="h-8 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((pod) => (
                <tr
                  key={pod.uid}
                  className="h-9 cursor-pointer border-b border-border-subtle hover:bg-surface-hover"
                  onClick={() => onOpenPod(pod)}
                >
                  <td className="px-3">
                    <button
                      type="button"
                      className={cn(
                        "font-mono text-[12px] text-primary hover:underline",
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPod(pod);
                      }}
                    >
                      {pod.name}
                    </button>
                  </td>
                  <td className="px-3">
                    <PodPhaseBadge phase={pod.phase} />
                  </td>
                  <td className="px-3 font-mono text-[12px]">{pod.ready}</td>
                  <td className="px-3 font-mono text-[12px]">{pod.restarts}</td>
                  <td className="px-3 font-mono text-[12px] text-muted-foreground">
                    {pod.nodeName || "—"}
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

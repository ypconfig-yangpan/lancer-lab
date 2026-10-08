import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { kubernetesApi } from "@/capabilities/kubernetes/api";
import {
  useDeployments,
  useEvents,
  useNamespaces,
  usePods,
} from "@/capabilities/kubernetes/connect/use-cluster-connection";
import { useEnsureLancerKubeConnection } from "@/capabilities/kubernetes/connect/use-lancer-kube-connection";
import {
  buildNamespaceOptions,
  KUBE_PREFERRED_FALLBACK_NAMESPACE,
} from "@/capabilities/kubernetes/connect/namespace-options";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import { deploymentKeys, eventKeys, podKeys } from "@/capabilities/kubernetes/connect/query-keys";
import {
  patchDeploymentRestartedAt,
  refreshWorkloadQueries,
} from "@/capabilities/kubernetes/connect/refresh-workload-queries";
import { useResourceWatch } from "@/capabilities/kubernetes/connect/use-resource-watch";
import { KubernetesLogsPane } from "@/capabilities/kubernetes/logs/kubernetes-logs-pane";
import { podMatchesSelector, isRolloutNewPod } from "@/capabilities/kubernetes/logs/resolve-backing-pods";
import { ResourceYamlPane } from "@/capabilities/kubernetes/tables/resource-yaml-pane";
import {
  DeploymentRestartButton,
  DeploymentWriteActions,
} from "@/capabilities/kubernetes/ops/deployment-write-actions";
import type { DeploymentSummary } from "@/entities/deployment/types";
import {
  DashboardHeader,
  DashboardPage,
  PageTabsBar,
  PanelCard,
  Sparkline,
  StatCard,
  StatusDot,
} from "@/shared/dashboard-ui";
import { PodExecPane } from "@/capabilities/kubernetes/views/pod-exec-pane";
import { CompactSelect } from "@/components/ui/compact-select";
import { MoreMenu } from "@/components/ui/more-menu";
import { formatInstant, formatAge, useNowTick } from "@/shared/lib/datetime";
import { formatAppError } from "@/shared/lib/app-error";
import { cn } from "@/shared/lib/utils";
import { K8S_MOCK_CPU_SERIES, K8S_MOCK_MEM_SERIES } from "../mock/k8s-mock";
import { useK8sUiStore } from "../mock/k8s-ui-store";

const WORKLOAD_TABS = [
  { id: "deployment", label: "Deployment" },
  { id: "statefulset", label: "StatefulSet", disabled: true },
  { id: "daemonset", label: "DaemonSet", disabled: true },
  { id: "job", label: "Job", disabled: true },
  { id: "cronjob", label: "CronJob", disabled: true },
];

function isReadyHealthy(ready: string): boolean {
  const parts = ready.split("/");
  const a = Number.parseInt(parts[0] ?? "", 10);
  const b = Number.parseInt(parts[1] ?? "", 10);
  return Number.isFinite(a) && Number.isFinite(b) && a === b && b > 0;
}

function podStatusTone(phase: string): "success" | "warning" | "danger" {
  if (phase === "Running") return "success";
  if (phase === "Pending" || phase === "Terminating") return "warning";
  return "danger";
}

function podStatusLabel(phase: string): string {
  switch (phase) {
    case "Running":
      return "Running";
    case "Terminating":
      return "Terminating";
    case "Pending":
      return "Pending";
    default:
      return phase;
  }
}

/** Live Kubernetes Dashboard — connects via pasted kubeconfig in 凭证. */
export function KubernetesDashboardApp() {
  const { connecting, error, cluster, configured, paused, refetchConnected } =
    useEnsureLancerKubeConnection();
  const page = useK8sUiStore((s) => s.page);
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);

  // 挂在根上：列表↔详情切换时不中断 Watch（否则要重连，状态会顿一下）
  useResourceWatch(clusterId, namespace, "pod", clusterId !== null);
  useResourceWatch(clusterId, namespace, "deployment", clusterId !== null);
  useResourceWatch(clusterId, namespace, "event", clusterId !== null);

  if (connecting && !cluster) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        正在连接集群…
      </div>
    );
  }

  if ((error || paused) && !cluster) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[13px]">
        <p className={paused ? "text-foreground" : "text-destructive"}>
          {paused ? "Kubernetes 已断开" : `连接失败：${error}`}
        </p>
        <p className="text-muted-foreground">
          {paused
            ? "凭证仍在，到「凭证」点「连接」即可恢复"
            : configured
              ? "凭证文件已在，但连不上集群。可到「凭证」点「连接」，或检查 token / 证书"
              : "请到侧栏「凭证」粘贴 kubeconfig，并点「保存并连接」"}
        </p>
        {!paused ? (
          <button
            type="button"
            className="mt-2 text-[12px] text-primary hover:underline"
            onClick={() => refetchConnected()}
          >
            重试连接
          </button>
        ) : null}
      </div>
    );
  }

  if (page === "detail") {
    return <DeploymentDetailPage />;
  }
  return <KubernetesDashboardPage />;
}

function KubernetesDashboardPage() {
  const queryClient = useQueryClient();
  const cluster = useKubernetesWorkspaceStore((s) => s.activeCluster);
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);
  const setNamespace = useKubernetesWorkspaceStore((s) => s.setNamespace);
  const selectedId = useK8sUiStore((s) => s.selectedDeploymentId);
  const selectDeployment = useK8sUiStore((s) => s.selectDeployment);
  const openDetail = useK8sUiStore((s) => s.openDetail);
  const workloadTab = useK8sUiStore((s) => s.workloadTab);
  const setWorkloadTab = useK8sUiStore((s) => s.setWorkloadTab);
  const setSelectedResourceId = useKubernetesWorkspaceStore((s) => s.setSelectedResourceId);
  const setResourceListKind = useKubernetesWorkspaceStore((s) => s.setResourceListKind);

  useEffect(() => {
    setResourceListKind("deployment");
  }, [setResourceListKind]);

  const deploymentsQuery = useDeployments(clusterId, namespace, { enabled: clusterId !== null });
  const podsQuery = usePods(clusterId, namespace, { enabled: clusterId !== null });
  const namespacesQuery = useNamespaces(clusterId);
  useNowTick(1_000);

  const deployments = deploymentsQuery.data ?? [];
  const pods = podsQuery.data ?? [];

  useEffect(() => {
    if (selectedId === null && deployments[0]) {
      selectDeployment(deployments[0].uid);
    } else if (
      selectedId !== null &&
      deployments.length > 0 &&
      !deployments.some((d) => d.uid === selectedId)
    ) {
      selectDeployment(deployments[0]?.uid ?? null);
    }
  }, [deployments, selectDeployment, selectedId]);

  useEffect(() => {
    setSelectedResourceId(selectedId);
  }, [selectedId, setSelectedResourceId]);

  const selected = deployments.find((d) => d.uid === selectedId) ?? null;
  const relatedPods = useMemo(() => {
    if (!selected) return [];
    return pods.filter((p) => podMatchesSelector(p, selected.matchLabels));
  }, [pods, selected]);

  const relatedPodUids = useMemo(
    () => relatedPods.map((p) => p.uid).join(","),
    [relatedPods],
  );
  const [focusedPodUid, setFocusedPodUid] = useState<string | null>(null);
  const firstRelatedUid = relatedPods[0]?.uid ?? null;
  useEffect(() => {
    // 换 Deployment / Pod 列表变化时：保留仍有效的选中，否则落到第一个
    setFocusedPodUid((current) => {
      if (current && relatedPods.some((p) => p.uid === current)) {
        return current;
      }
      return firstRelatedUid;
    });
    // relatedPodUids 概括列表成员变化，避免依赖整个数组引用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, firstRelatedUid, relatedPodUids]);

  const readyPods = pods.filter((p) => p.phase === "Running").length;
  const nsOptions = buildNamespaceOptions(namespacesQuery.data, namespace || "default");

  // 项目 token 在 default 常 403：自动切到 sly-test
  useEffect(() => {
    if (namespace && namespace !== "default") return;
    if (!deploymentsQuery.isError) return;
    const msg = formatAppError(deploymentsQuery.error).message.toLowerCase();
    if (!msg.includes("permission") && !msg.includes("denied") && !msg.includes("forbidden")) {
      return;
    }
    setNamespace(KUBE_PREFERRED_FALLBACK_NAMESPACE);
  }, [deploymentsQuery.error, deploymentsQuery.isError, namespace, setNamespace]);

  const refresh = () => {
    if (!clusterId) return;
    void queryClient.invalidateQueries({ queryKey: deploymentKeys.list(clusterId, namespace) });
    void queryClient.invalidateQueries({ queryKey: podKeys.list(clusterId, namespace) });
    void queryClient.invalidateQueries({ queryKey: eventKeys.list(clusterId, namespace) });
    toast.message("Refreshed");
  };

  return (
    <DashboardPage fill>
      <div className="shrink-0">
        <DashboardHeader
          title="Kubernetes"
          badge={
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-white px-2.5 py-0.5 text-[12px]">
              <span className="size-1.5 rounded-full bg-success" />
              <span className="max-w-[220px] truncate font-mono">
                {cluster?.displayName ?? cluster?.context ?? "cluster"}
              </span>
            </span>
          }
          trailing={
            <CompactSelect
              size="md"
              value={namespace || KUBE_PREFERRED_FALLBACK_NAMESPACE}
              onChange={(e) => {
                setNamespace(e.target.value);
                selectDeployment(null);
              }}
              aria-label="Namespace"
              triggerClassName="min-w-[120px] font-mono"
            >
              {nsOptions.map((ns) => (
                <option key={ns} value={ns}>
                  {ns}
                </option>
              ))}
            </CompactSelect>
          }
          onRefresh={refresh}
        />
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Deployments"
          value={String(deployments.length)}
          tone="info"
          hint={namespace}
        />
        <StatCard
          label="Pod"
          value={`${readyPods}/${pods.length}`}
          tone={readyPods === pods.length && pods.length > 0 ? "success" : "warning"}
          hint="Running / Total"
        />
        <StatCard label="CPU" value="—" hint="No metrics API" />
        <StatCard label="Memory" value="—" hint="No metrics API" />
      </div>

      <PanelCard className="min-h-0 flex-[1.15]" bodyClassName="overflow-auto">
        <div className="sticky top-0 z-10 bg-white px-4 pt-1">
          <PageTabsBar items={WORKLOAD_TABS} value={workloadTab} onChange={setWorkloadTab} />
        </div>
        <div>
          {deploymentsQuery.isLoading ? (
            <p className="px-4 py-6 text-[12px] text-muted-foreground">Loading deployments…</p>
          ) : deploymentsQuery.isError ? (
            <div className="space-y-2 px-4 py-6 text-[12px]">
              <p className="text-destructive">
                {formatAppError(deploymentsQuery.error).message}
              </p>
              <p className="text-muted-foreground">
                凭证已连上，但当前 Namespace「{namespace}」可能无权限。Rancher 项目 token 请改用{" "}
                <button
                  type="button"
                  className="font-mono text-primary hover:underline"
                  onClick={() => setNamespace(KUBE_PREFERRED_FALLBACK_NAMESPACE)}
                >
                  {KUBE_PREFERRED_FALLBACK_NAMESPACE}
                </button>
                等业务空间。
              </p>
            </div>
          ) : deployments.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-muted-foreground">No deployments in {namespace}</p>
          ) : (
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-10 z-10 bg-white">
                <tr className="border-b border-border-subtle text-[11px] text-muted-foreground">
                  {["Name", "Namespace", "Type", "Replica", "Status", "Update Time", "操作"].map(
                    (h) => (
                      <th key={h} className="h-9 px-4 font-semibold">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => {
                  const selectedRow = d.uid === selectedId;
                  const healthy = isReadyHealthy(d.ready);
                  return (
                    <tr
                      key={d.uid}
                      className={cn(
                        "h-11 cursor-pointer border-b border-border-subtle/80 hover:bg-surface-hover",
                        selectedRow && "bg-primary/5",
                      )}
                      onClick={() => selectDeployment(d.uid)}
                      title="单击选中，联动下方 Pod / 日志"
                    >
                      <td className="px-4">
                        <button
                          type="button"
                          className="font-medium text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(d.uid);
                          }}
                        >
                          {d.name}
                        </button>
                      </td>
                      <td className="px-4 font-mono text-[12px]">{d.namespace}</td>
                      <td className="px-4">Deployment</td>
                      <td className="px-4 font-mono text-[12px]">{d.ready}</td>
                      <td className="px-4">
                        <StatusDot
                          label={healthy ? "Running" : "Degraded"}
                          tone={healthy ? "success" : "warning"}
                        />
                      </td>
                      <td className="px-4 text-muted-foreground">
                        {formatInstant(d.createdAt)}
                      </td>
                      <td className="px-4" onClick={(e) => e.stopPropagation()}>
                        <MoreMenu
                          items={[
                            {
                              id: "detail",
                              label: "详情",
                              onSelect: () => openDetail(d.uid),
                            },
                            {
                              id: "restart",
                              label: "重启",
                              disabled: !cluster || cluster.readonly,
                              onSelect: () => {
                                if (!cluster) return;
                                if (!window.confirm(`确认重启 Deployment「${d.name}」？`)) {
                                  return;
                                }
                                void (async () => {
                                  try {
                                    const result = await kubernetesApi.restartDeployment({
                                      clusterId: cluster.id,
                                      namespace: d.namespace,
                                      name: d.name,
                                    });
                                    patchDeploymentRestartedAt(
                                      queryClient,
                                      cluster.id,
                                      d.namespace,
                                      d.name,
                                      result.restartedAt,
                                    );
                                    toast.success(`已触发重启：${d.name}`);
                                    await refreshWorkloadQueries(
                                      queryClient,
                                      cluster.id,
                                      d.namespace,
                                    );
                                  } catch (err: unknown) {
                                    toast.error(
                                      err instanceof Error ? err.message : String(err),
                                    );
                                  }
                                })();
                              },
                            },
                            {
                              id: "logs",
                              label: "日志",
                              onSelect: () => {
                                selectDeployment(d.uid);
                                openDetail(d.uid);
                                useK8sUiStore.getState().setDetailTab("logs");
                              },
                            },
                            {
                              id: "exec",
                              label: "执行命令",
                              disabled: !cluster || cluster.readonly,
                              onSelect: () => {
                                selectDeployment(d.uid);
                                openDetail(d.uid);
                                useK8sUiStore.getState().setDetailTab("exec");
                              },
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </PanelCard>

      <div className="grid h-[min(300px,34vh)] shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
        <PanelCard title="Pod 详情" className="min-h-0" bodyClassName="overflow-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-border-subtle text-[11px] text-muted-foreground">
                {["名称", "状态", "Ready", "重启", "Age", "IP", "节点"].map((h) => (
                  <th key={h} className="h-8 px-3 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {relatedPods.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-[12px] text-muted-foreground">
                    {selected ? "暂无匹配 Pod" : "请先选择上方 Deployment"}
                  </td>
                </tr>
              ) : (
                relatedPods.map((p) => {
                  const active = p.uid === focusedPodUid;
                  const isNew = isRolloutNewPod(p, relatedPods, selected?.restartedAt);
                  return (
                    <tr
                      key={p.uid}
                      className={cn(
                        "h-9 cursor-pointer border-b border-border-subtle/70 hover:bg-surface-hover",
                        isNew && "bg-emerald-50",
                        p.phase === "Terminating" && "bg-amber-50",
                        !isNew &&
                          p.phase !== "Terminating" &&
                          relatedPods.length > 1 &&
                          "bg-slate-50/80",
                        active && "bg-primary/5",
                      )}
                      title={isNew ? "本次滚动新建的 Pod" : undefined}
                      onClick={() => setFocusedPodUid(p.uid)}
                    >
                      <td className="px-3">
                        <button
                          type="button"
                          className="font-mono text-[12px] text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFocusedPodUid(p.uid);
                          }}
                        >
                          {p.name}
                        </button>
                      </td>
                      <td className="px-3">
                        <StatusDot
                          label={podStatusLabel(p.phase)}
                          tone={podStatusTone(p.phase)}
                        />
                      </td>
                      <td className="px-3 font-mono text-[12px]">{p.ready}</td>
                      <td className="px-3 font-mono text-[12px]">{p.restarts}</td>
                      <td className="px-3 font-mono text-[12px]" title={formatInstant(p.createdAt)}>
                        {formatAge(p.createdAt)}
                      </td>
                      <td className="px-3 font-mono text-[12px] text-muted-foreground">
                        {p.podIp || "—"}
                      </td>
                      <td className="px-3 font-mono text-[12px] text-muted-foreground">
                        {p.nodeName || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </PanelCard>

        <div className="min-h-0">
          <KubernetesLogsPane
            embedded
            allowPodSwitch
            openWhenExpanded
            defaultCollapsed
            enableCollapse
            focusedPodUid={focusedPodUid}
            onFocusedPodUidChange={setFocusedPodUid}
            expandedClassName="h-full"
          />
        </div>
      </div>
    </DashboardPage>
  );
}

function DeploymentDetailPage() {
  const openDashboard = useK8sUiStore((s) => s.openDashboard);
  const selectedId = useK8sUiStore((s) => s.selectedDeploymentId);
  const detailTab = useK8sUiStore((s) => s.detailTab);
  const setDetailTab = useK8sUiStore((s) => s.setDetailTab);
  const cluster = useKubernetesWorkspaceStore((s) => s.activeCluster);
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);
  const setSelectedResourceId = useKubernetesWorkspaceStore((s) => s.setSelectedResourceId);
  const setResourceListKind = useKubernetesWorkspaceStore((s) => s.setResourceListKind);

  const deploymentsQuery = useDeployments(clusterId, namespace, { enabled: clusterId !== null });
  const podsQuery = usePods(clusterId, namespace, { enabled: clusterId !== null });
  const eventsQuery = useEvents(clusterId, namespace, { enabled: clusterId !== null });
  useNowTick(1_000);

  const dep: DeploymentSummary | null =
    deploymentsQuery.data?.find((d) => d.uid === selectedId) ?? null;

  useEffect(() => {
    setResourceListKind("deployment");
    setSelectedResourceId(selectedId);
  }, [selectedId, setSelectedResourceId, setResourceListKind]);

  if (!dep) {
    return (
      <DashboardPage>
        <p className="text-[13px] text-muted-foreground">Deployment not found.</p>
        <Button variant="secondary" size="sm" onClick={openDashboard}>
          Back
        </Button>
      </DashboardPage>
    );
  }

  const pods = (podsQuery.data ?? []).filter((p) => podMatchesSelector(p, dep.matchLabels));
  const events = (eventsQuery.data ?? [])
    .filter(
      (e) =>
        e.involvedName === dep.name ||
        e.message.includes(dep.name) ||
        (e.involvedKind === "Deployment" && e.involvedName === dep.name),
    )
    .slice(0, 20);
  const healthy = isReadyHealthy(dep.ready);

  return (
    <DashboardPage>
      <div className="text-[12px] text-muted-foreground">
        <button type="button" className="hover:text-primary" onClick={openDashboard}>
          Kubernetes
        </button>
        <span className="mx-1.5">/</span>
        <span>Workload</span>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">Deployment</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[20px] font-semibold">Deployment Detail: {dep.name}</h1>
        <StatusDot label={healthy ? "Running" : "Degraded"} tone={healthy ? "success" : "warning"} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {cluster ? <DeploymentRestartButton cluster={cluster} deployment={dep} /> : null}
          <Button variant="secondary" size="sm" onClick={() => setDetailTab("exec")}>
            执行命令
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDetailTab("logs")}>
            日志
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDetailTab("yaml")}>
            YAML
          </Button>
        </div>
      </div>

      {cluster?.readonly ? (
        <p className="text-[12px] text-amber-700">当前为只读连接，重启/执行命令不可用。</p>
      ) : null}

      <PageTabsBar
        items={[
          { id: "overview", label: "Overview" },
          { id: "events", label: "Events" },
          { id: "logs", label: "Logs" },
          { id: "exec", label: "执行命令" },
          { id: "yaml", label: "YAML" },
        ]}
        value={detailTab}
        onChange={(id) => setDetailTab(id as typeof detailTab)}
      />

      {detailTab === "overview" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <PanelCard title="Basic Info">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-[13px]">
              <div>
                <dt className="text-[11px] text-muted-foreground">Name</dt>
                <dd className="font-mono">{dep.name}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">Namespace</dt>
                <dd className="font-mono">{dep.namespace}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">Replicas</dt>
                <dd className="font-mono">{dep.ready}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">Available</dt>
                <dd className="font-mono">{dep.available}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] text-muted-foreground">Image</dt>
                <dd className="truncate font-mono text-[12px]" title={dep.image}>
                  {dep.image || "—"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] text-muted-foreground">Created</dt>
                <dd>{formatInstant(dep.createdAt)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] text-muted-foreground">上次重启</dt>
                <dd title={dep.restartedAt || undefined}>
                  {dep.restartedAt
                    ? `${formatInstant(dep.restartedAt)}（${formatAge(dep.restartedAt)}前）`
                    : "—"}
                </dd>
              </div>
            </dl>
            {cluster ? (
              <div className="border-t border-border-subtle px-2 pb-2">
                <DeploymentWriteActions cluster={cluster} deployment={dep} />
              </div>
            ) : null}
          </PanelCard>
          <PanelCard title="Resource Monitoring">
            <div className="grid grid-cols-2 gap-4 p-4">
              <div>
                <div className="mb-1 text-[12px] text-muted-foreground">CPU (placeholder)</div>
                <Sparkline points={K8S_MOCK_CPU_SERIES} />
                <p className="mt-1 text-[10px] text-muted-foreground">No metrics API</p>
              </div>
              <div>
                <div className="mb-1 text-[12px] text-muted-foreground">Memory (placeholder)</div>
                <Sparkline points={K8S_MOCK_MEM_SERIES} stroke="#7c3aed" />
                <p className="mt-1 text-[10px] text-muted-foreground">No metrics API</p>
              </div>
            </div>
          </PanelCard>
          <PanelCard title="Pods" className="lg:col-span-2">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] text-muted-foreground">
                  {["Name", "Status", "Ready", "Restarts", "Age", "IP", "Node", "Image", "操作"].map(
                    (h) => (
                      <th key={h} className="h-8 px-4 font-semibold">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {pods.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-[12px] text-muted-foreground">
                      暂无 Pod
                    </td>
                  </tr>
                ) : (
                  pods.map((p) => {
                    const isNew = isRolloutNewPod(p, pods, dep.restartedAt);
                    return (
                    <tr
                      key={p.uid}
                      className={cn(
                        "h-9 border-b border-border-subtle/70",
                        isNew && "bg-emerald-50",
                        p.phase === "Terminating" && "bg-amber-50",
                        !isNew &&
                          p.phase !== "Terminating" &&
                          pods.length > 1 &&
                          "bg-slate-50/80",
                      )}
                      title={isNew ? "本次滚动新建的 Pod" : undefined}
                    >
                      <td className="px-4 font-mono text-[12px] text-primary">{p.name}</td>
                      <td className="px-4">
                        <StatusDot
                          label={podStatusLabel(p.phase)}
                          tone={podStatusTone(p.phase)}
                        />
                      </td>
                      <td className="px-4 font-mono text-[12px]">{p.ready}</td>
                      <td className="px-4 font-mono text-[12px]">{p.restarts}</td>
                      <td className="px-4 font-mono text-[12px]" title={formatInstant(p.createdAt)}>
                        {formatAge(p.createdAt)}
                      </td>
                      <td className="px-4 font-mono text-[12px]">{p.podIp || "—"}</td>
                      <td className="px-4 font-mono text-[12px]">{p.nodeName || "—"}</td>
                      <td
                        className="max-w-[180px] truncate px-4 font-mono text-[11px] text-muted-foreground"
                        title={p.image}
                      >
                        {p.image || "—"}
                      </td>
                      <td className="px-4">
                        <MoreMenu
                          items={[
                            {
                              id: "logs",
                              label: "日志",
                              onSelect: () => {
                                setSelectedResourceId(dep.uid);
                                setDetailTab("logs");
                              },
                            },
                            {
                              id: "exec",
                              label: "执行命令",
                              disabled: !cluster || cluster.readonly,
                              onSelect: () => {
                                setSelectedResourceId(dep.uid);
                                setDetailTab("exec");
                              },
                            },
                          ]}
                        />
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </PanelCard>
        </div>
      ) : null}

      {detailTab === "events" ? (
        <PanelCard title="Events">
          {events.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-muted-foreground">
              {eventsQuery.isLoading ? "Loading…" : "No related events"}
            </p>
          ) : (
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] text-muted-foreground">
                  {["Time", "Type", "Reason", "Message"].map((h) => (
                    <th key={h} className="h-8 px-4 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.uid} className="border-b border-border-subtle/70">
                    <td className="px-4 py-2 font-mono text-[12px] text-muted-foreground">
                      {formatInstant(ev.lastTimestamp)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusDot
                        label={ev.eventType}
                        tone={ev.eventType === "Warning" ? "warning" : "success"}
                      />
                    </td>
                    <td className="px-4 py-2 font-medium">{ev.reason}</td>
                    <td className="max-w-[360px] truncate px-4 py-2 text-muted-foreground" title={ev.message}>
                      {ev.message}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PanelCard>
      ) : null}

      {detailTab === "logs" && clusterId ? (
        <div className="shrink-0">
          <KubernetesLogsPane
            embedded
            allowServiceSwitch={false}
            allowPodSwitch
            enableCollapse={false}
            expandedClassName="h-[min(520px,62vh)]"
          />
        </div>
      ) : null}

      {detailTab === "exec" && clusterId ? (
        <div className="h-[min(480px,58vh)] min-h-[320px]">
          <PodExecPane embedded />
        </div>
      ) : null}

      {detailTab === "yaml" && clusterId ? (
        <PanelCard title="YAML">
          <div className="h-[420px]">
            <ResourceYamlPane
              clusterId={clusterId}
              namespace={dep.namespace}
              kind="deployment"
              name={dep.name}
            />
          </div>
        </PanelCard>
      ) : null}
    </DashboardPage>
  );
}

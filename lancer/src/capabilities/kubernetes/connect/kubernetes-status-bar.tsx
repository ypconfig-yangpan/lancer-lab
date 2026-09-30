import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import type { EnvironmentRiskLevel } from "@/entities/cluster/types";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import { usePods } from "@/capabilities/kubernetes/connect/use-cluster-connection";
import { type ConnectionStatus, deriveConnectionStatus } from "@/features/shell/connection-status";
import { cn } from "@/shared/lib/utils";

const riskClass: Record<EnvironmentRiskLevel, string> = {
  LOCAL: "bg-env-local/20 text-env-local",
  DEV: "bg-env-dev/20 text-env-dev",
  TEST: "bg-env-test/20 text-env-test",
  STAGING: "bg-env-staging/20 text-env-staging",
  PROD: "bg-env-prod/20 text-env-prod",
};

const connectionClass: Record<ConnectionStatus, string> = {
  disconnected: "text-muted-foreground",
  syncing: "text-info",
  connected: "text-success",
  stale: "text-warning",
  error: "text-error",
};

/** Left-aligned Kubernetes identity strip (StatusBar order < 50). */
export function KubernetesStatusIdentity() {
  const { t } = useTranslation();
  const cluster = useKubernetesWorkspaceStore((s) => s.activeCluster);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);

  return (
    <>
      <span className="truncate text-muted-foreground">
        {t("status.cluster")}:{" "}
        <span className="text-foreground">{cluster?.displayName ?? t("cluster.disconnected")}</span>
      </span>
      <span className="truncate text-muted-foreground">
        {t("status.namespace")}: <span className="text-foreground">{namespace}</span>
      </span>
      {cluster !== null ? (
        <Badge className={cn(riskClass[cluster.riskLevel])}>{cluster.riskLevel}</Badge>
      ) : null}
    </>
  );
}

/** Right-aligned Kubernetes connection probe (StatusBar order >= 50). */
export function KubernetesStatusConnection() {
  const { t } = useTranslation();
  const cluster = useKubernetesWorkspaceStore((s) => s.activeCluster);
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);
  const podsQuery = usePods(clusterId, namespace);
  const connection = deriveConnectionStatus({
    clusterId,
    isFetching: podsQuery.isFetching,
    isError: podsQuery.isError,
    hasData: podsQuery.data !== undefined,
  });
  const connectionLabel: Record<ConnectionStatus, string> = {
    disconnected: t("status.connection.disconnected"),
    syncing: t("status.connection.syncing"),
    connected: t("status.connection.connected"),
    stale: t("status.connection.stale"),
    error: t("status.connection.error"),
  };

  return (
    <>
      <span className={cn("shrink-0", connectionClass[connection])}>
        {connectionLabel[connection]}
      </span>
      {cluster?.tlsInsecure === true ? (
        <span className="shrink-0 text-warning">{t("status.tlsInsecure")}</span>
      ) : null}
      {cluster?.readonly === true ? (
        <span className="shrink-0 text-muted-foreground">{t("status.readonly")}</span>
      ) : null}
    </>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import {
  useConnectCluster,
  useDisconnectCluster,
  useKubeContexts,
} from "@/capabilities/kubernetes/connect/use-cluster-connection";
import { formatAppError } from "@/shared/lib/app-error";
import { cn } from "@/shared/lib/utils";

/** Compact cluster connect chrome for Explorer (LAYOUT Context Explorer). */
export function ClusterConnectPanel() {
  const { t } = useTranslation();
  const contextsQuery = useKubeContexts();
  const connect = useConnectCluster();
  const disconnect = useDisconnectCluster();
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const cluster = useKubernetesWorkspaceStore((s) => s.activeCluster);
  const [contextOverride, setContextOverride] = useState<string | null>(null);
  const [readonly, setReadonly] = useState(true);

  const contexts = contextsQuery.data ?? [];
  const contextName =
    contextOverride ?? contexts.find((item) => item.isCurrent)?.name ?? contexts[0]?.name ?? "";
  const connectError = connect.error !== null ? formatAppError(connect.error) : null;
  const disconnectError = disconnect.error !== null ? formatAppError(disconnect.error) : null;
  const contextsError = contextsQuery.error !== null ? formatAppError(contextsQuery.error) : null;

  if (cluster !== null && clusterId !== null) {
    return (
      <div className="border-b border-border-subtle px-2 py-2">
        <div className="flex items-start gap-2 px-1">
          <div className="min-w-0 flex-1">
            <div className="truncate font-mono text-[12px] font-medium">{cluster.displayName}</div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {cluster.riskLevel}
              {cluster.readonly ? ` · ${t("status.readonly")}` : ""}
              {cluster.tlsInsecure ? ` · ${t("status.tlsInsecure")}` : ""}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 px-2 text-[11px]"
            disabled={disconnect.isPending}
            onClick={() => disconnect.mutate(clusterId)}
          >
            {t("cluster.disconnect")}
          </Button>
        </div>
        {disconnectError !== null ? (
          <p className="mt-1 px-1 text-[11px] text-destructive">
            {disconnectError.code}: {disconnectError.message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-b border-border-subtle px-2 py-2">
      <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("sidebar.cluster")}
      </div>
      <select
        className="mt-1.5 w-full rounded-[6px] border border-input bg-background px-1.5 py-1 font-mono text-[11px]"
        value={contextName}
        disabled={contexts.length === 0 || connect.isPending}
        onChange={(event) => setContextOverride(event.target.value)}
        aria-label={t("cluster.selectContext")}
      >
        {contexts.length === 0 ? (
          <option value="">{t("cluster.noContexts")}</option>
        ) : (
          contexts.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
              {item.isCurrent ? " *" : ""}
            </option>
          ))
        )}
      </select>
      <div className="mt-1.5 flex items-center gap-2 px-0.5">
        <label className="flex min-w-0 flex-1 items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            className="size-3 shrink-0"
            checked={readonly}
            disabled={connect.isPending}
            onChange={(event) => setReadonly(event.target.checked)}
          />
          <span className="truncate" title={t("cluster.readonlyHint")}>
            {t("cluster.readonly")}
          </span>
        </label>
        <Button
          size="sm"
          className={cn("h-7 shrink-0 px-3 text-[11px]")}
          disabled={contextName.length === 0 || connect.isPending}
          onClick={() => {
            const selected = contexts.find((item) => item.name === contextName);
            const defaultNamespace = selected?.namespace;
            connect.mutate({
              context: contextName,
              readonly,
              ...(defaultNamespace !== null && defaultNamespace !== undefined
                ? { defaultNamespace }
                : {}),
            });
          }}
        >
          {connect.isPending ? "…" : t("cluster.connect")}
        </Button>
      </div>
      {contextsError !== null ? (
        <p className="mt-1 px-1 text-[11px] text-destructive">
          {contextsError.code}: {contextsError.message}
        </p>
      ) : null}
      {connectError !== null ? (
        <p className="mt-1 px-1 text-[11px] text-destructive">
          {connectError.code}: {connectError.message}
        </p>
      ) : null}
    </div>
  );
}

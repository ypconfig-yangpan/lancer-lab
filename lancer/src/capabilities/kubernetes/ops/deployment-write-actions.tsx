import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button, InspectorSection } from "@lancer/ui";
import { kubernetesApi } from "@/capabilities/kubernetes/api";
import type { ClusterIdentity } from "@/entities/cluster/types";
import type { DeploymentSummary } from "@/entities/deployment/types";
import {
  patchDeploymentRestartedAt,
  refreshWorkloadQueries,
} from "@/capabilities/kubernetes/connect/refresh-workload-queries";
import { cn } from "@/shared/lib/utils";

type ConfirmKind = "scale" | "restart" | "updateImage" | "delete" | null;

interface DeploymentWriteActionsProps {
  cluster: ClusterIdentity;
  deployment: DeploymentSummary;
  /** When true, Restart is omitted here (shown as header primary). */
  hideRestart?: boolean;
}

/**
 * Phase 3 write entrance: Scale / Restart / Update Image / Delete with confirm + Cluster/NS Diff.
 * Readonly / missing capability → actions disabled.
 * V2: kubernetesApi direct IPC (no shell.apply).
 */
export function DeploymentWriteActions({
  cluster,
  deployment,
  hideRestart = false,
}: DeploymentWriteActionsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [replicasInput, setReplicasInput] = useState(String(deployment.replicas));
  const [imageInput, setImageInput] = useState(deployment.image);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);

  const canPatch = !cluster.readonly && cluster.capabilities.canPatchDeployments;
  const canDelete = !cluster.readonly && cluster.capabilities.canDeleteDeployments;
  /** Rancher project tokens often fail cluster-scoped SSAR; allow try when not readonly. */
  const canTryWrite = !cluster.readonly;
  const isProd = cluster.riskLevel === "PROD";
  const parsedReplicas = Number.parseInt(replicasInput, 10);
  const replicasValid =
    Number.isFinite(parsedReplicas) && parsedReplicas >= 0 && parsedReplicas <= 10_000;
  const scaleChanged = replicasValid && parsedReplicas !== deployment.replicas;
  const imageTrimmed = imageInput.trim();
  const imageChanged = imageTrimmed.length > 0 && imageTrimmed !== deployment.image;

  const invalidate = async () => {
    await refreshWorkloadQueries(
      queryClient,
      cluster.id,
      deployment.namespace,
    );
  };

  const runScale = async () => {
    if (!replicasValid || !canTryWrite) {
      return;
    }
    setBusy(true);
    setError(null);
    setLastOk(null);
    try {
      const result = await kubernetesApi.scaleDeployment({
        clusterId: cluster.id,
        namespace: deployment.namespace,
        name: deployment.name,
        replicas: parsedReplicas,
      });
      setLastOk(
        t("deployment.write.scaleOk", {
          from: result.previousReplicas,
          to: result.replicas,
          id: result.operationId,
        }),
      );
      setConfirm(null);
      await invalidate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runRestart = async () => {
    if (!canTryWrite) {
      return;
    }
    setBusy(true);
    setError(null);
    setLastOk(null);
    try {
      const result = await kubernetesApi.restartDeployment({
        clusterId: cluster.id,
        namespace: deployment.namespace,
        name: deployment.name,
      });
      patchDeploymentRestartedAt(
        queryClient,
        cluster.id,
        deployment.namespace,
        deployment.name,
        result.restartedAt,
      );
      setLastOk(t("deployment.write.restartOk", { id: result.operationId }));
      setConfirm(null);
      await invalidate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runUpdateImage = async () => {
    if (!canTryWrite || !imageChanged) {
      return;
    }
    setBusy(true);
    setError(null);
    setLastOk(null);
    try {
      const result = await kubernetesApi.updateDeploymentImage({
        clusterId: cluster.id,
        namespace: deployment.namespace,
        name: deployment.name,
        image: imageTrimmed,
      });
      setLastOk(
        t("deployment.write.updateImageOk", {
          from: result.previousImage,
          to: result.image,
          container: result.container,
          id: result.operationId,
        }),
      );
      setConfirm(null);
      await invalidate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const runDelete = async () => {
    if (!canTryWrite) {
      return;
    }
    setBusy(true);
    setError(null);
    setLastOk(null);
    try {
      const result = await kubernetesApi.deleteDeployment({
        clusterId: cluster.id,
        namespace: deployment.namespace,
        name: deployment.name,
      });
      setLastOk(t("deployment.write.deleteOk", { id: result.operationId }));
      setConfirm(null);
      await invalidate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <InspectorSection title={t("deployment.write.title")}>
      <div className="flex flex-col gap-2 text-[13px]">
        {!cluster.readonly && (!canPatch || !canDelete) ? (
          <p className="text-[11px] text-amber-700">
            SSAR 未完全确认写权限；将直接尝试调用（与 Rancher 一致）。失败时会提示错误。
            {!canPatch ? " · patch 探测未通过" : ""}
            {!canDelete ? " · delete 探测未通过" : ""}
          </p>
        ) : null}
        {cluster.readonly ? (
          <p className="text-muted-foreground">{t("deployment.write.readonlyBlocked")}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!hideRestart ? (
            <Button
              size="sm"
              disabled={!canTryWrite || busy}
              onClick={() => {
                setError(null);
                setLastOk(null);
                setConfirm("restart");
              }}
            >
              {t("deployment.write.restart")}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            disabled={!canTryWrite || busy}
            onClick={() => {
              setError(null);
              setLastOk(null);
              setImageInput(deployment.image);
              setConfirm("updateImage");
            }}
          >
            {t("deployment.write.updateImage")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canTryWrite || busy}
            onClick={() => {
              setError(null);
              setLastOk(null);
              setReplicasInput(String(deployment.replicas));
              setConfirm("scale");
            }}
          >
            {t("deployment.write.scale")}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={!canTryWrite || busy}
            onClick={() => {
              setError(null);
              setLastOk(null);
              setConfirm("delete");
            }}
          >
            {t("deployment.write.delete")}
          </Button>
        </div>

        {confirm === "scale" ? (
          <div
            className={cn(
              "rounded-[8px] border border-border-subtle bg-surface-2 p-3",
              isProd && "border-destructive/40",
            )}
          >
            <p className="mb-2 font-medium">{t("deployment.write.confirmScale")}</p>
            <ConfirmContext cluster={cluster} deployment={deployment} isProd={isProd} />
            <label className="mt-2 flex items-center gap-2">
              <span className="text-muted-foreground">{t("deployment.write.replicas")}</span>
              <input
                type="number"
                min={0}
                max={10000}
                className="h-7 w-20 rounded-[6px] border border-border bg-surface-1 px-2 font-mono text-[12px]"
                value={replicasInput}
                onChange={(e) => setReplicasInput(e.target.value)}
                disabled={busy}
              />
            </label>
            <p className="mt-2 font-mono text-[12px]">
              <span className="text-muted-foreground">{t("deployment.write.diff")}: </span>
              {deployment.replicas} → {replicasValid ? parsedReplicas : "?"}
            </p>
            {isProd ? (
              <p className="mt-1 text-[12px] text-destructive">{t("deployment.write.prodWarning")}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={busy || !scaleChanged || !replicasValid}
                onClick={() => void runScale()}
              >
                {busy ? t("deployment.write.working") : t("deployment.write.confirm")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                {t("deployment.write.cancel")}
              </Button>
            </div>
          </div>
        ) : null}

        {confirm === "restart" ? (
          <div
            className={cn(
              "rounded-[8px] border border-border-subtle bg-surface-2 p-3",
              isProd && "border-destructive/40",
            )}
          >
            <p className="mb-2 font-medium">{t("deployment.write.confirmRestart")}</p>
            <ConfirmContext cluster={cluster} deployment={deployment} isProd={isProd} />
            <p className="mt-2 text-[12px] text-muted-foreground">
              {t("deployment.write.restartHint")}
            </p>
            {isProd ? (
              <p className="mt-1 text-[12px] text-destructive">{t("deployment.write.prodWarning")}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() => void runRestart()}
              >
                {busy ? t("deployment.write.working") : t("deployment.write.confirm")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                {t("deployment.write.cancel")}
              </Button>
            </div>
          </div>
        ) : null}

        {confirm === "updateImage" ? (
          <div
            className={cn(
              "rounded-[8px] border border-border-subtle bg-surface-2 p-3",
              isProd && "border-destructive/40",
            )}
          >
            <p className="mb-2 font-medium">{t("deployment.write.confirmUpdateImage")}</p>
            <ConfirmContext cluster={cluster} deployment={deployment} isProd={isProd} />
            <label className="mt-2 flex flex-col gap-1">
              <span className="text-muted-foreground">{t("deployment.write.image")}</span>
              <input
                type="text"
                className="h-8 w-full rounded-[6px] border border-border bg-surface-1 px-2 font-mono text-[12px]"
                value={imageInput}
                onChange={(e) => setImageInput(e.target.value)}
                disabled={busy}
                placeholder="nginx:1.27"
              />
            </label>
            <p className="mt-2 font-mono text-[12px]">
              <span className="text-muted-foreground">{t("deployment.write.diff")}: </span>
              {deployment.image || "—"} → {imageTrimmed || "?"}
            </p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {t("deployment.write.updateImageHint")}
            </p>
            {isProd ? (
              <p className="mt-1 text-[12px] text-destructive">{t("deployment.write.prodWarning")}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={busy || !imageChanged}
                onClick={() => void runUpdateImage()}
              >
                {busy ? t("deployment.write.working") : t("deployment.write.confirm")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                {t("deployment.write.cancel")}
              </Button>
            </div>
          </div>
        ) : null}

        {confirm === "delete" ? (
          <div
            className={cn(
              "rounded-[8px] border border-destructive/40 bg-surface-2 p-3",
            )}
          >
            <p className="mb-2 font-medium">{t("deployment.write.confirmDelete")}</p>
            <ConfirmContext cluster={cluster} deployment={deployment} isProd={isProd} />
            <p className="mt-2 text-[12px] text-destructive">
              {t("deployment.write.deleteHint")}
            </p>
            {isProd ? (
              <p className="mt-1 text-[12px] text-destructive">{t("deployment.write.prodWarning")}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Button
                variant="danger"
                size="sm"
                disabled={busy}
                onClick={() => void runDelete()}
              >
                {busy ? t("deployment.write.working") : t("deployment.write.confirm")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                {t("deployment.write.cancel")}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        {lastOk ? <p className="text-[12px] text-muted-foreground">{lastOk}</p> : null}
      </div>
    </InspectorSection>
  );
}

function ConfirmContext({
  cluster,
  deployment,
  isProd,
}: {
  cluster: ClusterIdentity;
  deployment: DeploymentSummary;
  isProd: boolean;
}) {
  const { t } = useTranslation();
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
      <dt className="text-muted-foreground">{t("deployment.write.cluster")}</dt>
      <dd className="font-mono">
        {cluster.displayName}
        {isProd ? <span className="ml-1 text-destructive">PROD</span> : null}
      </dd>
      <dt className="text-muted-foreground">{t("deployment.write.namespace")}</dt>
      <dd className="font-mono">{deployment.namespace}</dd>
      <dt className="text-muted-foreground">{t("deployment.write.resource")}</dt>
      <dd className="font-mono">Deployment/{deployment.name}</dd>
    </dl>
  );
}

/** Design-spec header primary: Restart with refresh icon + inline confirm. */
export function DeploymentRestartButton({
  cluster,
  deployment,
}: {
  cluster: ClusterIdentity;
  deployment: DeploymentSummary;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canTryWrite = !cluster.readonly;
  const isProd = cluster.riskLevel === "PROD";

  const run = async () => {
    if (!canTryWrite) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await kubernetesApi.restartDeployment({
        clusterId: cluster.id,
        namespace: deployment.namespace,
        name: deployment.name,
      });
      patchDeploymentRestartedAt(
        queryClient,
        cluster.id,
        deployment.namespace,
        deployment.name,
        result.restartedAt,
      );
      setOpen(false);
      await refreshWorkloadQueries(queryClient, cluster.id, deployment.namespace);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative shrink-0">
      <Button
        size="sm"
        className="gap-1.5"
        disabled={!canTryWrite || busy}
        onClick={() => setOpen((v) => !v)}
      >
        <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
        {t("deployment.write.restart")}
      </Button>
      {open ? (
        <div
          className={cn(
            "absolute right-0 top-9 z-20 w-64 rounded-[8px] border border-border-subtle bg-surface-1 p-3 shadow-lg",
            isProd && "border-destructive/40",
          )}
        >
          <p className="mb-2 text-[12px] font-medium">{t("deployment.write.confirmRestart")}</p>
          <ConfirmContext cluster={cluster} deployment={deployment} isProd={isProd} />
          {error ? <p className="mt-2 text-[11px] text-destructive">{error}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busy} onClick={() => void run()}>
              {busy ? t("deployment.write.working") : t("deployment.write.confirm")}
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              {t("deployment.write.cancel")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

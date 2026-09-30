import { homeDir, join } from "@tauri-apps/api/path";
import { useEffect, useRef, useState } from "react";
import {
  useConnectCluster,
  useConnectedClusters,
} from "@/capabilities/kubernetes/connect/use-cluster-connection";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import { formatAppError } from "@/shared/lib/app-error";

/** Rancher test cluster — kubeconfig lives outside the repo. */
export const RANCHER_CONTEXT = "local-tcsl";
export const RANCHER_DEFAULT_NAMESPACE = "sly-test";
/** This token/user cannot list namespaces cluster-wide; use allowlist. */
export const RANCHER_NAMESPACES = ["sly-test", "sly-dev", "sly-uat", "bp-test"] as const;

export async function resolveRancherKubeconfigPath(): Promise<string> {
  const home = await homeDir();
  // Tauri 2 `join` is async — must await or path becomes "[object Promise]".
  return await join(home, ".kube", "lancer-rc-test.yaml");
}

/**
 * Auto-connect Dashboard to Rancher test kubeconfig on mount.
 */
export function useEnsureRancherConnection() {
  const connectedQuery = useConnectedClusters();
  const connect = useConnectCluster();
  const activeCluster = useKubernetesWorkspaceStore((s) => s.activeCluster);
  const setActiveCluster = useKubernetesWorkspaceStore((s) => s.setActiveCluster);
  const setNamespace = useKubernetesWorkspaceStore((s) => s.setNamespace);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (inFlight.current) {
      return;
    }
    if (connectedQuery.isLoading || connect.isPending) {
      return;
    }

    const ensureNamespace = () => {
      if (!RANCHER_NAMESPACES.includes(namespace as (typeof RANCHER_NAMESPACES)[number])) {
        setNamespace(RANCHER_DEFAULT_NAMESPACE);
      }
    };

    // Already in UI store
    if (activeCluster?.context === RANCHER_CONTEXT) {
      ensureNamespace();
      return;
    }

    // Rust side already connected — sync into UI store
    const existing = (connectedQuery.data ?? []).find((c) => c.context === RANCHER_CONTEXT);
    if (existing) {
      setActiveCluster(existing);
      ensureNamespace();
      return;
    }

    inFlight.current = true;
    setBusy(true);
    setLocalError(null);
    void (async () => {
      try {
        const kubeconfigPath = await resolveRancherKubeconfigPath();
        await connect.mutateAsync({
          context: RANCHER_CONTEXT,
          kubeconfigPath,
          defaultNamespace: RANCHER_DEFAULT_NAMESPACE,
          readonly: false,
        });
        setLocalError(null);
      } catch (err: unknown) {
        const formatted = formatAppError(err);
        setLocalError(`${formatted.code}: ${formatted.message}`);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    })();
  }, [
    activeCluster?.context,
    connect,
    connectedQuery.data,
    connectedQuery.isLoading,
    connect.isPending,
    namespace,
    setActiveCluster,
    setNamespace,
  ]);

  const mutationError =
    connect.error != null
      ? (() => {
          const formatted = formatAppError(connect.error);
          return `${formatted.code}: ${formatted.message}`;
        })()
      : null;

  return {
    connecting: connect.isPending || connectedQuery.isLoading || busy,
    error: localError ?? mutationError,
    cluster: activeCluster,
    refetchConnected: () => void connectedQuery.refetch(),
  };
}

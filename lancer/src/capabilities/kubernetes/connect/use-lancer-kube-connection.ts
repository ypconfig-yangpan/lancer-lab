import { useEffect, useRef, useState } from "react";
import { useKubeCredentialStatus } from "@/capabilities/connections/connect/use-credentials-queries";
import { useConnectionSessionStore } from "@/capabilities/connections/connect/connection-session-store";
import {
  useConnectCluster,
  useConnectedClusters,
} from "@/capabilities/kubernetes/connect/use-cluster-connection";
import { resolveWorkingNamespace } from "@/capabilities/kubernetes/connect/namespace-options";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import { formatAppError } from "@/shared/lib/app-error";

/**
 * Auto-connect Dashboard using pasted kubeconfig under ~/.lancer/kubeconfigs/.
 * 连接失败只记一次错误，不再循环重试（打包版否则会疯狂打 API）。
 */
export function useEnsureLancerKubeConnection() {
  const statusQuery = useKubeCredentialStatus(true);
  const connectedQuery = useConnectedClusters();
  const connect = useConnectCluster();
  const activeCluster = useKubernetesWorkspaceStore((s) => s.activeCluster);
  const setActiveCluster = useKubernetesWorkspaceStore((s) => s.setActiveCluster);
  const setNamespace = useKubernetesWorkspaceStore((s) => s.setNamespace);
  const kubeAutoConnect = useConnectionSessionStore((s) => s.kubeAutoConnect);
  const inFlight = useRef(false);
  const attempted = useRef(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    void statusQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时拉一次
  }, []);

  useEffect(() => {
    if (!kubeAutoConnect) {
      attempted.current = false;
    }
  }, [kubeAutoConnect]);

  const preferred = statusQuery.data?.preferredContext ?? null;
  const absolutePath = statusQuery.data?.absolutePath ?? null;
  const configured = statusQuery.data?.configured === true;
  const defaultNs = resolveWorkingNamespace(statusQuery.data?.defaultNamespace);
  const statusReady = statusQuery.isFetched && !statusQuery.isFetching;

  useEffect(() => {
    if (inFlight.current) return;
    if (!statusReady || connectedQuery.isLoading || connect.isPending) return;

    if (statusQuery.isError) {
      setLocalError(`读取凭证失败：${formatAppError(statusQuery.error).message}`);
      return;
    }

    if (!configured || !preferred || !absolutePath) {
      setLocalError("尚未配置 kubeconfig，请到「凭证」粘贴并点「保存并连接」");
      return;
    }

    if (activeCluster?.context === preferred) {
      if (defaultNs) setNamespace(defaultNs);
      setLocalError(null);
      return;
    }

    const existing = (connectedQuery.data ?? []).find((c) => c.context === preferred);
    if (existing) {
      setActiveCluster(existing);
      if (defaultNs) setNamespace(defaultNs);
      setLocalError(null);
      return;
    }

    if (!kubeAutoConnect) {
      setLocalError("已断开连接。请到「凭证」点「连接」");
      return;
    }

    if (attempted.current) {
      return;
    }

    attempted.current = true;
    inFlight.current = true;
    setBusy(true);
    setLocalError(null);
    void (async () => {
      try {
        await connect.mutateAsync({
          context: preferred,
          kubeconfigPath: absolutePath,
          defaultNamespace: defaultNs,
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
    absolutePath,
    configured,
    connect,
    connectedQuery.data,
    connectedQuery.isLoading,
    connect.isPending,
    defaultNs,
    kubeAutoConnect,
    preferred,
    setActiveCluster,
    setNamespace,
    statusQuery.error,
    statusQuery.isError,
    statusReady,
  ]);

  const mutationError =
    connect.error != null
      ? (() => {
          const formatted = formatAppError(connect.error);
          return `${formatted.code}: ${formatted.message}`;
        })()
      : null;

  return {
    connecting:
      kubeAutoConnect &&
      (!statusReady ||
        connect.isPending ||
        statusQuery.isLoading ||
        connectedQuery.isLoading ||
        busy),
    error: localError ?? mutationError,
    cluster: activeCluster,
    configured,
    paused: !kubeAutoConnect && !activeCluster,
    refetchConnected: () => {
      attempted.current = false;
      void statusQuery.refetch();
      void connectedQuery.refetch();
    },
  };
}

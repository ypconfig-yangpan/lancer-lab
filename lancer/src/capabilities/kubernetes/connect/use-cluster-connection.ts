import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { kubernetesApi } from "@/capabilities/kubernetes/api";
import type { ManifestResourceKind } from "@/entities/yaml/types";
import { useKubernetesWorkspaceStore } from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import {
  clusterKeys,
  deploymentKeys,
  eventKeys,
  namespaceKeys,
  podKeys,
  serviceKeys,
  yamlKeys,
} from "@/capabilities/kubernetes/connect/query-keys";
import { useWorkloadRefetchInterval } from "@/capabilities/kubernetes/connect/use-workload-refetch-interval";
import { logger } from "@/shared/logger";

export function useKubeContexts(kubeconfigPath?: string) {
  return useQuery({
    queryKey: clusterKeys.contexts(kubeconfigPath),
    queryFn: () => kubernetesApi.listContexts(kubeconfigPath),
    staleTime: 60_000,
    retry: false,
  });
}

export function useConnectedClusters() {
  return useQuery({
    queryKey: clusterKeys.connected(),
    queryFn: () => kubernetesApi.listConnected(),
    staleTime: 10_000,
    retry: false,
  });
}

export function useConnectCluster() {
  const queryClient = useQueryClient();
  const setActiveCluster = useKubernetesWorkspaceStore((s) => s.setActiveCluster);
  const setNamespace = useKubernetesWorkspaceStore((s) => s.setNamespace);

  return useMutation({
    mutationFn: (input: {
      context: string;
      kubeconfigPath?: string;
      defaultNamespace?: string;
      readonly?: boolean;
    }) => {
      const request: {
        context: string;
        kubeconfigPath?: string;
        readonly?: boolean;
        defaultNamespace?: string;
      } = {
        context: input.context,
        readonly: input.readonly ?? true,
      };
      if (input.kubeconfigPath !== undefined) {
        request.kubeconfigPath = input.kubeconfigPath;
      }
      if (input.defaultNamespace !== undefined) {
        request.defaultNamespace = input.defaultNamespace;
      }
      return kubernetesApi.connect(request);
    },
    onSuccess: (identity, input) => {
      setActiveCluster(identity);
      const namespace =
        input.defaultNamespace !== undefined && input.defaultNamespace.length > 0
          ? input.defaultNamespace
          : "default";
      setNamespace(namespace);
      logger.operation("cluster connected", {
        clusterId: identity.id,
        context: identity.context,
      });
      void queryClient.invalidateQueries({ queryKey: clusterKeys.connected() });
      void queryClient.invalidateQueries({ queryKey: namespaceKeys.list(identity.id) });
      void queryClient.invalidateQueries({ queryKey: podKeys.all });
      void queryClient.invalidateQueries({ queryKey: deploymentKeys.all });
      void queryClient.invalidateQueries({ queryKey: serviceKeys.all });
      void queryClient.invalidateQueries({ queryKey: eventKeys.all });
    },
  });
}

export function useDisconnectCluster() {
  const queryClient = useQueryClient();
  const activeClusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const setActiveCluster = useKubernetesWorkspaceStore((s) => s.setActiveCluster);

  return useMutation({
    mutationFn: (clusterId: string) => kubernetesApi.disconnect(clusterId),
    onSuccess: (_void, clusterId) => {
      if (activeClusterId === clusterId) {
        setActiveCluster(null);
      }
      logger.operation("cluster disconnected", { clusterId });
      void queryClient.invalidateQueries({ queryKey: clusterKeys.connected() });
      void queryClient.removeQueries({ queryKey: namespaceKeys.list(clusterId) });
      void queryClient.removeQueries({ queryKey: podKeys.all });
      void queryClient.removeQueries({ queryKey: deploymentKeys.all });
      void queryClient.removeQueries({ queryKey: serviceKeys.all });
      void queryClient.removeQueries({ queryKey: eventKeys.all });
    },
  });
}

export function useNamespaces(clusterId: string | null) {
  return useQuery({
    queryKey: namespaceKeys.list(clusterId ?? "none"),
    queryFn: () => {
      if (clusterId === null) {
        return Promise.reject(new Error("cluster not selected"));
      }
      return kubernetesApi.listNamespaces(clusterId);
    },
    enabled: clusterId !== null,
    staleTime: 30_000,
    retry: false,
  });
}

export function usePods(
  clusterId: string | null,
  namespace: string,
  options?: { enabled?: boolean },
) {
  // Watch 增量为主；30s 仅作兜底（断线/漏事件）
  const refetchInterval = useWorkloadRefetchInterval(30_000, 2_000);
  return useQuery({
    queryKey: podKeys.list(clusterId ?? "none", namespace),
    queryFn: () => {
      if (clusterId === null) {
        return Promise.reject(new Error("cluster not selected"));
      }
      return kubernetesApi.listPods(clusterId, namespace);
    },
    enabled: (options?.enabled ?? true) && clusterId !== null && namespace.length > 0,
    staleTime: 30_000,
    refetchInterval,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function useDeployments(
  clusterId: string | null,
  namespace: string,
  options?: { enabled?: boolean },
) {
  const refetchInterval = useWorkloadRefetchInterval(30_000, 2_000);
  return useQuery({
    queryKey: deploymentKeys.list(clusterId ?? "none", namespace),
    queryFn: () => {
      if (clusterId === null) {
        return Promise.reject(new Error("cluster not selected"));
      }
      return kubernetesApi.listDeployments(clusterId, namespace);
    },
    enabled: (options?.enabled ?? true) && clusterId !== null && namespace.length > 0,
    staleTime: 30_000,
    refetchInterval,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function useServices(
  clusterId: string | null,
  namespace: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: serviceKeys.list(clusterId ?? "none", namespace),
    queryFn: () => {
      if (clusterId === null) {
        return Promise.reject(new Error("cluster not selected"));
      }
      return kubernetesApi.listServices(clusterId, namespace);
    },
    enabled: (options?.enabled ?? true) && clusterId !== null && namespace.length > 0,
    staleTime: 5_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function useEvents(
  clusterId: string | null,
  namespace: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: eventKeys.list(clusterId ?? "none", namespace),
    queryFn: () => {
      if (clusterId === null) {
        return Promise.reject(new Error("cluster not selected"));
      }
      return kubernetesApi.listEvents(clusterId, namespace);
    },
    enabled: (options?.enabled ?? true) && clusterId !== null && namespace.length > 0,
    staleTime: 5_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function useResourceYaml(
  clusterId: string,
  namespace: string,
  kind: ManifestResourceKind,
  name: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: yamlKeys.detail(clusterId, namespace, kind, name),
    queryFn: () => kubernetesApi.getYaml({ clusterId, namespace, kind, name }),
    enabled: enabled && namespace.length > 0 && name.length > 0,
    staleTime: 30_000,
    retry: false,
  });
}

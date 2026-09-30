/** Kubernetes workspace selection store — capability-owned export. */
export {
  useKubernetesWorkspaceStore,
  type ResourceListKind,
} from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";

export {
  KUBERNETES_CAPABILITY_ID,
  KUBERNETES_MODULE_ID,
  clusterKeys,
  deploymentKeys,
  eventKeys,
  namespaceKeys,
  podKeys,
  serviceKeys,
  yamlKeys,
} from "@/capabilities/kubernetes/connect/query-keys";

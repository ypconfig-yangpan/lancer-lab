/** Query keys for Kubernetes capability. */
export const KUBERNETES_MODULE_ID = "kubernetes";
/** @deprecated use KUBERNETES_MODULE_ID */
export const KUBERNETES_CAPABILITY_ID = KUBERNETES_MODULE_ID;

const root = [KUBERNETES_MODULE_ID] as const;

export const clusterKeys = {
  all: [...root, "clusters"] as const,
  contexts: (kubeconfigPath?: string) =>
    [...clusterKeys.all, "contexts", kubeconfigPath ?? "default"] as const,
  connected: () => [...clusterKeys.all, "connected"] as const,
  detail: (clusterId: string) => [...clusterKeys.all, "detail", clusterId] as const,
};

export const namespaceKeys = {
  all: [...root, "namespaces"] as const,
  list: (clusterId: string) => [...namespaceKeys.all, clusterId] as const,
};

export const podKeys = {
  all: [...root, "pods"] as const,
  list: (clusterId: string, namespace: string) => [...podKeys.all, clusterId, namespace] as const,
};

export const deploymentKeys = {
  all: [...root, "deployments"] as const,
  list: (clusterId: string, namespace: string) =>
    [...deploymentKeys.all, clusterId, namespace] as const,
};

export const serviceKeys = {
  all: [...root, "services"] as const,
  list: (clusterId: string, namespace: string) =>
    [...serviceKeys.all, clusterId, namespace] as const,
};

export const eventKeys = {
  all: [...root, "events"] as const,
  list: (clusterId: string, namespace: string) => [...eventKeys.all, clusterId, namespace] as const,
};

export const yamlKeys = {
  all: [...root, "resourceYaml"] as const,
  detail: (clusterId: string, namespace: string, kind: string, name: string) =>
    [...yamlKeys.all, clusterId, namespace, kind, name] as const,
};

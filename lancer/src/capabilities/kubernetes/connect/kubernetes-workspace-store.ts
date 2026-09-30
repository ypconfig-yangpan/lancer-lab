import { create } from "zustand";
import type { ClusterIdentity } from "@/entities/cluster/types";
import { KUBE_PREFERRED_FALLBACK_NAMESPACE } from "@/capabilities/kubernetes/connect/namespace-options";

export type ResourceListKind = "pod" | "deployment" | "service";

interface KubernetesWorkspaceState {
  activeClusterId: string | null;
  activeCluster: ClusterIdentity | null;
  namespace: string;
  resourceListKind: ResourceListKind;
  selectedResourceId: string | null;
  setActiveCluster: (cluster: ClusterIdentity | null) => void;
  setNamespace: (namespace: string) => void;
  setResourceListKind: (kind: ResourceListKind) => void;
  setSelectedResourceId: (id: string | null) => void;
  /** Module deactivate must clear domain selection (no stale Core leakage). */
  reset: () => void;
}

const initialState = {
  activeClusterId: null as string | null,
  activeCluster: null as ClusterIdentity | null,
  namespace: KUBE_PREFERRED_FALLBACK_NAMESPACE,
  resourceListKind: "deployment" as ResourceListKind,
  selectedResourceId: null as string | null,
};

/**
 * Kubernetes module UI selection state.
 * Not Core workspace — cleared on module deactivate.
 */
export const useKubernetesWorkspaceStore = create<KubernetesWorkspaceState>((set) => ({
  ...initialState,
  setActiveCluster: (cluster) =>
    set({
      activeCluster: cluster,
      activeClusterId: cluster?.id ?? null,
      selectedResourceId: null,
    }),
  setNamespace: (namespace) => set({ namespace, selectedResourceId: null }),
  setResourceListKind: (resourceListKind) => set({ resourceListKind, selectedResourceId: null }),
  setSelectedResourceId: (selectedResourceId) => set({ selectedResourceId }),
  reset: () => set({ ...initialState }),
}));

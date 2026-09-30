import { create } from "zustand";

type K8sPage = "dashboard" | "detail";

interface K8sUiState {
  page: K8sPage;
  selectedDeploymentId: string | null;
  detailTab: "overview" | "events" | "logs" | "exec" | "yaml";
  workloadTab: string;
  openDashboard: () => void;
  openDetail: (deploymentId: string) => void;
  setDetailTab: (tab: K8sUiState["detailTab"]) => void;
  setWorkloadTab: (tab: string) => void;
  selectDeployment: (id: string | null) => void;
}

export const useK8sUiStore = create<K8sUiState>((set) => ({
  page: "dashboard",
  selectedDeploymentId: null,
  detailTab: "overview",
  workloadTab: "deployment",
  openDashboard: () => set({ page: "dashboard", detailTab: "overview" }),
  openDetail: (deploymentId) =>
    set({ page: "detail", selectedDeploymentId: deploymentId, detailTab: "overview" }),
  setDetailTab: (detailTab) => set({ detailTab }),
  setWorkloadTab: (workloadTab) => set({ workloadTab }),
  selectDeployment: (selectedDeploymentId) => set({ selectedDeploymentId }),
}));

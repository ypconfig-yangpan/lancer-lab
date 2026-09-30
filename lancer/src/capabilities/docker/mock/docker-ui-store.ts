import { create } from "zustand";

type DockerPage = "dashboard" | "detail";

interface DockerUiState {
  page: DockerPage;
  selectedContainerId: string | null;
  detailTab: "overview" | "logs" | "stats" | "events";
  consoleTab: "overview" | "logs" | "ports" | "stats";
  openDashboard: () => void;
  openDetail: (containerId: string) => void;
  selectContainer: (id: string | null) => void;
  setDetailTab: (tab: DockerUiState["detailTab"]) => void;
  setConsoleTab: (tab: DockerUiState["consoleTab"]) => void;
}

export const useDockerUiStore = create<DockerUiState>((set) => ({
  page: "dashboard",
  selectedContainerId: "c1",
  detailTab: "overview",
  consoleTab: "logs",
  openDashboard: () => set({ page: "dashboard" }),
  openDetail: (containerId) =>
    set({ page: "detail", selectedContainerId: containerId, detailTab: "overview" }),
  selectContainer: (selectedContainerId) => set({ selectedContainerId }),
  setDetailTab: (detailTab) => set({ detailTab }),
  setConsoleTab: (consoleTab) => set({ consoleTab }),
}));

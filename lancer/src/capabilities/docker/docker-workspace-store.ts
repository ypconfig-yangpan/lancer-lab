import { create } from "zustand";

export type DockerEngineStatus = "unknown" | "checking" | "online" | "offline" | "mock";
export type DockerContainerGroup = "all" | "running" | "exited";
export type DockerExplorerSection = "containers" | "images" | "volumes";

interface DockerWorkspaceState {
  engineStatus: DockerEngineStatus;
  apiVersion: string | null;
  lastError: string | null;
  nameFilter: string;
  containerGroup: DockerContainerGroup;
  explorerSection: DockerExplorerSection;
  showAll: boolean;
  setEngineStatus: (
    status: DockerEngineStatus,
    meta?: { apiVersion?: string | null; lastError?: string | null },
  ) => void;
  setNameFilter: (value: string) => void;
  setContainerGroup: (value: DockerContainerGroup) => void;
  setExplorerSection: (value: DockerExplorerSection) => void;
  setShowAll: (value: boolean) => void;
  reset: () => void;
}

const initial = {
  engineStatus: "unknown" as DockerEngineStatus,
  apiVersion: null as string | null,
  lastError: null as string | null,
  nameFilter: "",
  containerGroup: "all" as DockerContainerGroup,
  explorerSection: "containers" as DockerExplorerSection,
  showAll: true,
};

/** Docker capability chrome — engine reachability + table filters. */
export const useDockerWorkspaceStore = create<DockerWorkspaceState>((set) => ({
  ...initial,
  setEngineStatus: (engineStatus, meta) =>
    set({
      engineStatus,
      ...(meta?.apiVersion !== undefined ? { apiVersion: meta.apiVersion } : {}),
      ...(meta?.lastError !== undefined ? { lastError: meta.lastError } : {}),
    }),
  setNameFilter: (nameFilter) => set({ nameFilter }),
  setContainerGroup: (containerGroup) => set({ containerGroup }),
  setExplorerSection: (explorerSection) => set({ explorerSection }),
  setShowAll: (showAll) => set({ showAll }),
  reset: () => set(initial),
}));

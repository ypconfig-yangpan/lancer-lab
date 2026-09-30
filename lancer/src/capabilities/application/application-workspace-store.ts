import { create } from "zustand";

interface ApplicationWorkspaceState {
  selectedAppId: string | null;
  setSelectedAppId: (id: string | null) => void;
  reset: () => void;
}

/** Experience-local selection — cleared on deactivate. */
export const useApplicationWorkspaceStore = create<ApplicationWorkspaceState>((set) => ({
  selectedAppId: "app-billing",
  setSelectedAppId: (selectedAppId) => set({ selectedAppId }),
  reset: () => set({ selectedAppId: "app-billing" }),
}));

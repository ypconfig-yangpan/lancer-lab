import { create } from "zustand";

export type ThemeMode = "system" | "dark" | "light";
/** Core bottom tabs only; module views use activeBottomViewId. */
export type BottomPanelTab = "terminal";

const THEME_STORAGE_KEY = "lancer.theme";

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "system" || stored === "dark" || stored === "light") {
    return stored;
  }
  return "light";
}

interface WorkspaceChromeState {
  /** Activity Bar selection (activity contribution id). */
  activeActivityId: string | null;
  /** Alias — same as activeActivityId for Connections / tool switch. */
  activeModuleId: string | null;
  bottomTab: BottomPanelTab;
  /** Module-contributed bottom panel view id; null = core Terminal tab. */
  activeBottomViewId: string | null;
  theme: ThemeMode;
  commandPaletteOpen: boolean;
  setActiveActivityId: (id: string | null) => void;
  setActiveModuleId: (id: string | null) => void;
  setBottomTab: (tab: BottomPanelTab) => void;
  setActiveBottomViewId: (viewId: string | null) => void;
  setTheme: (theme: ThemeMode) => void;
  setCommandPaletteOpen: (open: boolean) => void;
}

/**
 * Core UI chrome only — tabs live in tabs-store.
 * No Kubernetes / DevOps domain fields.
 */
export const useWorkspaceStore = create<WorkspaceChromeState>((set) => ({
  activeActivityId: null,
  activeModuleId: null,
  bottomTab: "terminal",
  activeBottomViewId: null,
  theme: readStoredTheme(),
  commandPaletteOpen: false,
  setActiveActivityId: (activeActivityId) =>
    set({ activeActivityId, activeModuleId: activeActivityId }),
  setActiveModuleId: (activeModuleId) =>
    set({ activeModuleId, activeActivityId: activeModuleId }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setActiveBottomViewId: (activeBottomViewId) => set({ activeBottomViewId }),
  setTheme: (theme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    set({ theme });
  },
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
}));


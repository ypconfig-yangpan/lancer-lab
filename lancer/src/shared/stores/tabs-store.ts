import { create } from "zustand";

export interface WorkspaceTab {
  id: string;
  viewId: string;
  moduleId: string;
  title: string;
  params?: unknown;
  /** false = preview (single-click, replaced by next preview); true = pinned. */
  pinned: boolean;
}

export type OpenTabMode = "preview" | "pinned";

interface TabsState {
  openTabs: WorkspaceTab[];
  activeTabId: string | null;
  openWorkspaceTab: (
    tab: Omit<WorkspaceTab, "pinned"> & { pinned?: boolean },
    mode?: OpenTabMode,
  ) => void;
  pinWorkspaceTab: (tabId: string) => void;
  closeWorkspaceTab: (tabId: string) => void;
  setActiveTabId: (tabId: string | null) => void;
  clearTabsForModule: (moduleId: string) => void;
}

function withPinned(
  tab: Omit<WorkspaceTab, "pinned"> & { pinned?: boolean },
  pinned: boolean,
): WorkspaceTab {
  return {
    id: tab.id,
    viewId: tab.viewId,
    moduleId: tab.moduleId,
    title: tab.title,
    pinned,
    ...(tab.params !== undefined ? { params: tab.params } : {}),
  };
}

/**
 * Main Workspace tab model (LAYOUT_SYSTEM §4).
 * Preview: at most one unpinned tab; next preview replaces it.
 * Pinned: persists until closed.
 */
export const useTabsStore = create<TabsState>((set, get) => ({
  openTabs: [],
  activeTabId: null,

  openWorkspaceTab: (tab, mode = "preview") => {
    const wantPinned = mode === "pinned" || tab.pinned === true;
    const { openTabs, activeTabId } = get();
    const existing = openTabs.find((t) => t.id === tab.id);

    if (existing) {
      const next = openTabs.map((t) =>
        t.id === tab.id ? withPinned({ ...existing, ...tab }, wantPinned || existing.pinned) : t,
      );
      set({ openTabs: next, activeTabId: tab.id });
      return;
    }

    if (wantPinned) {
      const pinned = openTabs.filter((t) => t.pinned);
      const previews = openTabs.filter((t) => !t.pinned);
      set({
        openTabs: [...pinned, withPinned(tab, true), ...previews],
        activeTabId: tab.id,
      });
      return;
    }

    const previewIdx = openTabs.findIndex((t) => !t.pinned);
    if (previewIdx >= 0) {
      const next = [...openTabs];
      next[previewIdx] = withPinned(tab, false);
      set({ openTabs: next, activeTabId: tab.id });
      return;
    }

    set({
      openTabs: [...openTabs, withPinned(tab, false)],
      activeTabId: tab.id,
    });
    void activeTabId;
  },

  pinWorkspaceTab: (tabId) => {
    set((state) => ({
      openTabs: state.openTabs.map((t) => (t.id === tabId ? { ...t, pinned: true } : t)),
    }));
  },

  closeWorkspaceTab: (tabId) => {
    const { openTabs, activeTabId } = get();
    const next = openTabs.filter((t) => t.id !== tabId);
    const nextActive =
      activeTabId === tabId ? (next[next.length - 1]?.id ?? null) : activeTabId;
    set({ openTabs: next, activeTabId: nextActive });
  },

  setActiveTabId: (activeTabId) => set({ activeTabId }),

  clearTabsForModule: (moduleId) => {
    const { openTabs, activeTabId } = get();
    const next = openTabs.filter((t) => t.moduleId !== moduleId);
    const nextActive =
      activeTabId && next.some((t) => t.id === activeTabId)
        ? activeTabId
        : (next[next.length - 1]?.id ?? null);
    set({ openTabs: next, activeTabId: nextActive });
  },
}));

import { create } from "zustand";

/** Per-module table/tree selection for workspace + inspector. */
export interface ModuleSelection {
  selectedRowId: string | null;
  selectedTreeNodeId: string | null;
  filter: Record<string, string>;
}

const empty = (): ModuleSelection => ({
  selectedRowId: null,
  selectedTreeNodeId: null,
  filter: {},
});

interface ModuleSelectionState {
  byModule: Record<string, ModuleSelection>;
  setSelectedRow: (moduleId: string, rowId: string | null) => void;
  setTreeSelection: (
    moduleId: string,
    nodeId: string | null,
    filter?: Record<string, string>,
  ) => void;
  clearModule: (moduleId: string) => void;
  getModule: (moduleId: string) => ModuleSelection;
}

export const useModuleSelectionStore = create<ModuleSelectionState>((set, get) => ({
  byModule: {},

  setSelectedRow(moduleId, rowId) {
    set((state) => {
      const prev = state.byModule[moduleId] ?? empty();
      return {
        byModule: {
          ...state.byModule,
          [moduleId]: { ...prev, selectedRowId: rowId },
        },
      };
    });
  },

  setTreeSelection(moduleId, nodeId, filter = {}) {
    set((state) => {
      const prev = state.byModule[moduleId] ?? empty();
      return {
        byModule: {
          ...state.byModule,
          [moduleId]: {
            ...prev,
            selectedTreeNodeId: nodeId,
            filter,
            selectedRowId: null,
          },
        },
      };
    });
  },

  clearModule(moduleId) {
    set((state) => {
      const next = { ...state.byModule };
      delete next[moduleId];
      return { byModule: next };
    });
  },

  getModule(moduleId) {
    return get().byModule[moduleId] ?? empty();
  },
}));

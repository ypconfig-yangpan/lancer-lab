import { create } from "zustand";

/**
 * Shell chrome: whether the active module's Inspector has a selection.
 * Drives auto-collapse; not domain state.
 */
interface InspectorChromeState {
  hasSelectionByModule: Record<string, boolean>;
  setHasSelection: (moduleId: string, has: boolean) => void;
  clearModule: (moduleId: string) => void;
  hasSelection: (moduleId: string | null) => boolean;
}

export const useInspectorChromeStore = create<InspectorChromeState>((set, get) => ({
  hasSelectionByModule: {},

  setHasSelection(moduleId, has) {
    set((state) => {
      const prev = state.hasSelectionByModule[moduleId] === true;
      if (prev === has) {
        return state;
      }
      return {
        hasSelectionByModule: {
          ...state.hasSelectionByModule,
          [moduleId]: has,
        },
      };
    });
  },

  clearModule(moduleId) {
    set((state) => {
      if (!(moduleId in state.hasSelectionByModule)) {
        return state;
      }
      const next = { ...state.hasSelectionByModule };
      delete next[moduleId];
      return { hasSelectionByModule: next };
    });
  },

  hasSelection(moduleId) {
    if (moduleId === null) {
      return false;
    }
    return get().hasSelectionByModule[moduleId] === true;
  },
}));

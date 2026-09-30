import { create } from "zustand";

/**
 * 用户在「凭证」点断开后，禁止各模块挂载时自动重连；点「连接」再打开。
 * 仅会话级：重启应用仍会按已保存凭证自动连。
 */
interface ConnectionSessionState {
  kubeAutoConnect: boolean;
  jenkinsAutoConnect: boolean;
  setKubeAutoConnect: (enabled: boolean) => void;
  setJenkinsAutoConnect: (enabled: boolean) => void;
}

export const useConnectionSessionStore = create<ConnectionSessionState>((set) => ({
  kubeAutoConnect: true,
  jenkinsAutoConnect: true,
  setKubeAutoConnect: (enabled) => set({ kubeAutoConnect: enabled }),
  setJenkinsAutoConnect: (enabled) => set({ jenkinsAutoConnect: enabled }),
}));

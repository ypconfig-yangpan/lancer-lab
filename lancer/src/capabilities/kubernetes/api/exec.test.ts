import { describe, expect, it, vi } from "vitest";
import { kubernetesPodExecApi } from "./exec";

vi.mock("@/shared/tauri", () => ({
  invokeCommand: vi.fn(),
  TauriInvokeError: class TauriInvokeError extends Error {
    appError: { code: string; message: string; detail: string | null; retryable: boolean };
    constructor(appError: {
      code: string;
      message: string;
      detail: string | null;
      retryable: boolean;
    }) {
      super(appError.message);
      this.appError = appError;
    }
  },
}));

import { invokeCommand } from "@/shared/tauri";

describe("kubernetesPodExecApi", () => {
  it("opens via pod_exec_open without plugin.apply", async () => {
    vi.mocked(invokeCommand).mockResolvedValueOnce({
      sessionId: "kexec_1",
      clusterId: "c1",
      namespace: "default",
      pod: "nginx",
      status: "open",
    });

    const session = await kubernetesPodExecApi.open({
      clusterId: "c1",
      namespace: "default",
      pod: "nginx",
      cols: 80,
      rows: 24,
    });

    expect(invokeCommand).toHaveBeenCalledWith("pod_exec_open", {
      input: {
        clusterId: "c1",
        namespace: "default",
        pod: "nginx",
        container: null,
        cols: 80,
        rows: 24,
      },
    });
    expect(session.sessionId).toBe("kexec_1");
  });
});

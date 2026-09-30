/**
 * V2 Capability API — Pod Exec.
 * Direct native IPC; does NOT use shell.apply / PluginRequest.
 */
import { invokeCommand, TauriInvokeError } from "@/shared/tauri";

export interface PodExecSession {
  sessionId: string;
  clusterId: string;
  namespace: string;
  pod: string;
  status: string;
}

interface PodExecSessionDto {
  sessionId: string;
  clusterId: string;
  namespace: string;
  pod: string;
  status: string;
}

function mapInvokeError(error: unknown, fallback: string): Error {
  if (error instanceof TauriInvokeError) {
    return new Error(error.appError.message || fallback);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(fallback);
}

export const kubernetesPodExecApi = {
  async open(input: {
    clusterId: string;
    namespace: string;
    pod: string;
    container?: string;
    cols?: number;
    rows?: number;
  }): Promise<PodExecSession> {
    try {
      const dto = await invokeCommand<PodExecSessionDto>("pod_exec_open", {
        input: {
          clusterId: input.clusterId,
          namespace: input.namespace,
          pod: input.pod,
          container: input.container ?? null,
          cols: input.cols ?? null,
          rows: input.rows ?? null,
        },
      });
      return {
        sessionId: dto.sessionId,
        clusterId: dto.clusterId,
        namespace: dto.namespace,
        pod: dto.pod,
        status: dto.status,
      };
    } catch (error: unknown) {
      throw mapInvokeError(error, "pod exec open failed");
    }
  },

  async write(sessionId: string, data: string): Promise<void> {
    try {
      await invokeCommand("pod_exec_write", {
        input: { sessionId, data },
      });
    } catch (error: unknown) {
      throw mapInvokeError(error, "pod exec write failed");
    }
  },

  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    try {
      await invokeCommand("pod_exec_resize", {
        input: { sessionId, cols, rows },
      });
    } catch (error: unknown) {
      throw mapInvokeError(error, "pod exec resize failed");
    }
  },

  async close(sessionId: string): Promise<void> {
    try {
      await invokeCommand("pod_exec_close", {
        input: { sessionId },
      });
    } catch (error: unknown) {
      throw mapInvokeError(error, "pod exec close failed");
    }
  },
};

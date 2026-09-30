import { invoke } from "@tauri-apps/api/core";
import type { AppErrorDto } from "@/entities/cluster/types";
import { isAppErrorDto } from "@/entities/cluster/types";

export class TauriInvokeError extends Error {
  readonly appError: AppErrorDto;

  constructor(appError: AppErrorDto) {
    super(appError.message);
    this.name = "TauriInvokeError";
    this.appError = appError;
  }
}

/** Shared invoke wrapper — domain APIs live in capability modules. */
export async function invokeCommand<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error: unknown) {
    if (isAppErrorDto(error)) {
      throw new TauriInvokeError(error);
    }
    if (
      typeof error === "object" &&
      error !== null &&
      isAppErrorDto((error as { error?: unknown }).error)
    ) {
      throw new TauriInvokeError((error as { error: AppErrorDto }).error);
    }
    throw error;
  }
}

export const appApi = {
  health(): Promise<{
    status: string;
    phase: string;
    kubernetesConnected: boolean;
    lastAbnormalExit: boolean;
    logDir: string;
  }> {
    return invokeCommand("app_health");
  },
  ackAbnormalExit(): Promise<void> {
    return invokeCommand("ack_abnormal_exit");
  },
  /** Frontend-initiated clean shutdown: Rust stops watches and disconnects clusters. */
  prepareShutdown(): Promise<void> {
    return invokeCommand("app_prepare_shutdown");
  },
  listLogFiles(): Promise<string[]> {
    return invokeCommand("list_diagnostic_log_files");
  },
};

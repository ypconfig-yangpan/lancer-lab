import type { QueryClient } from "@tanstack/react-query";
import type { AppSubsystem } from "@/app/lancer-app";
import {
  createDesktopShellRuntime,
  type ShellRuntime,
} from "@/app/capability-bootstrap";
import { logger } from "@/shared/logger";

/**
 * Shell module subsystem (was Plugin kernel).
 * start(): attach query client and activate all builtin modules once.
 * stop(): deactivate every active module.
 */
export class KernelSubsystem implements AppSubsystem {
  readonly id = "shell-modules";
  readonly runtime: ShellRuntime;
  private readonly queryClient: QueryClient;

  constructor(
    queryClient: QueryClient,
    runtime: ShellRuntime = createDesktopShellRuntime(),
  ) {
    this.queryClient = queryClient;
    this.runtime = runtime;
  }

  async start(): Promise<void> {
    this.runtime.platform.setQueryClient(this.queryClient);
    await this.runtime.modules.activateAll();
  }

  async stop(): Promise<void> {
    try {
      await this.runtime.modules.deactivateAll("host-shutdown");
    } catch (error) {
      logger.error("shell module deactivate failed on shutdown", {
        error: String(error),
      });
    }
  }
}

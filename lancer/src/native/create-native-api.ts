import { appApi } from "@/shared/tauri";
import type { NativeArgocdApi } from "./argocd";
import { createDefaultDockerNativeApi } from "./docker-bridge";
import { NativeCapabilityError } from "./errors";
import type { NativeGitApi } from "./git";
import type { NativeHarborApi } from "./harbor";
import { createDefaultJenkinsNativeApi } from "./jenkins";
import { createDefaultKubernetesNativeApi } from "./kubernetes";
import { createDefaultLogsNativeApi } from "./logs";
import type { NativeSshApi } from "./ssh";
import type { NativeApi, NativeApiBridge } from "./types";

function unavailable(capability: string): never {
  throw new NativeCapabilityError(
    "NATIVE_UNAVAILABLE",
    `Native capability "${capability}" is not available in this build`,
  );
}

function forbidden(capability: string, reason: string): never {
  throw new NativeCapabilityError(
    "NATIVE_FORBIDDEN",
    `Native capability "${capability}" is forbidden: ${reason}`,
  );
}

function createUnavailableGitApi(): NativeGitApi {
  return {
    async listBranches() {
      unavailable("git.listBranches");
    },
  };
}

function createUnavailableSshApi(): NativeSshApi {
  return {
    async listSessions() {
      unavailable("ssh.listSessions");
    },
  };
}

function createUnavailableArgocdApi(): NativeArgocdApi {
  return {
    async listApplications() {
      unavailable("argocd.listApplications");
    },
  };
}

function createUnavailableHarborApi(): NativeHarborApi {
  return {
    async listArtifacts() {
      unavailable("harbor.listArtifacts");
    },
  };
}

/**
 * Host-owned Native API. Command names stay inside native adapters (and Rust).
 */
export function createNativeApi(options?: {
  pluginId?: string;
  bridge?: NativeApiBridge;
}): NativeApi {
  void options?.pluginId;
  const bridge: NativeApiBridge = options?.bridge ?? {
    health: () => appApi.health(),
  };
  const kubernetes = bridge.kubernetes ?? createDefaultKubernetesNativeApi();
  const docker = bridge.docker ?? createDefaultDockerNativeApi();
  const git = bridge.git ?? createUnavailableGitApi();
  const ssh = bridge.ssh ?? createUnavailableSshApi();
  const jenkins = bridge.jenkins ?? createDefaultJenkinsNativeApi();
  const argocd = bridge.argocd ?? createUnavailableArgocdApi();
  const harbor = bridge.harbor ?? createUnavailableHarborApi();
  // Default: Disk-as-Source via Tauri. Unit tests inject createInMemoryLogsNativeApi.
  const logs = bridge.logs ?? createDefaultLogsNativeApi();

  return {
    process: {
      async exec() {
        forbidden(
          "process.exec",
          "arbitrary host shell is not allowed; use provider-scoped native APIs",
        );
      },
    },
    fs: {
      async readText() {
        unavailable("fs.readText");
      },
      async writeText() {
        unavailable("fs.writeText");
      },
    },
    credentials: {
      async getSecret() {
        unavailable("credentials.getSecret");
      },
    },
    logs,
    terminal: {
      async open() {
        unavailable("terminal.open");
      },
    },
    streams: {
      async close() {
        unavailable("streams.close");
      },
    },
    compression: {
      async gzipFile() {
        unavailable("compression.gzipFile");
      },
    },
    diagnostics: {
      async health() {
        try {
          return await bridge.health();
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "diagnostics bridge failed";
          throw new NativeCapabilityError("NATIVE_BRIDGE_FAILED", message, {
            retryable: true,
          });
        }
      },
    },
    kubernetes,
    docker,
    git,
    ssh,
    jenkins,
    argocd,
    harbor,
  };
}

import type { ClusterIdentity, KubeContextSummary } from "@/entities/cluster/types";
import type {
  DeleteDeploymentResult,
  DeploymentSummary,
  RestartDeploymentResult,
  ScaleDeploymentResult,
  UpdateDeploymentImageResult,
} from "@/entities/deployment/types";
import type { EventSummary } from "@/entities/event/types";
import { ageSecondsFrom } from "@/shared/lib/datetime";
import type { PodSummary } from "@/entities/pod/types";
import type { ServiceSummary } from "@/entities/service/types";
import type { ResourceWatchKind } from "@/entities/watch/types";
import type { ManifestResourceKind, ResourceYaml } from "@/entities/yaml/types";
import { invokeCommand, TauriInvokeError } from "@/shared/tauri";
import { NativeCapabilityError, type NativeErrorCode } from "./errors";

/**
 * Platform Native Accelerator for cluster read/watch/write (ADR 0004 / 0013).
 * Command names stay in this module — plugins use ctx.native.kubernetes only.
 */
export interface NativeKubernetesApi {
  listContexts(kubeconfigPath?: string): Promise<KubeContextSummary[]>;
  connect(input: {
    context: string;
    kubeconfigPath?: string;
    readonly?: boolean;
    defaultNamespace?: string;
  }): Promise<ClusterIdentity>;
  disconnect(clusterId: string): Promise<void>;
  listConnected(): Promise<ClusterIdentity[]>;
  listNamespaces(clusterId: string): Promise<string[]>;
  listPods(clusterId: string, namespace: string): Promise<PodSummary[]>;
  listDeployments(clusterId: string, namespace: string): Promise<DeploymentSummary[]>;
  listServices(clusterId: string, namespace: string): Promise<ServiceSummary[]>;
  listEvents(clusterId: string, namespace: string): Promise<EventSummary[]>;
  getYaml(input: {
    clusterId: string;
    namespace: string;
    kind: ManifestResourceKind;
    name: string;
  }): Promise<ResourceYaml>;
  startWatch(input: {
    clusterId: string;
    namespace: string;
    kind: ResourceWatchKind;
  }): Promise<void>;
  stopWatch(input: {
    clusterId: string;
    namespace: string;
    kind: ResourceWatchKind;
  }): Promise<void>;
  scaleDeployment(input: {
    clusterId: string;
    namespace: string;
    name: string;
    replicas: number;
  }): Promise<ScaleDeploymentResult>;
  restartDeployment(input: {
    clusterId: string;
    namespace: string;
    name: string;
  }): Promise<RestartDeploymentResult>;
  updateDeploymentImage(input: {
    clusterId: string;
    namespace: string;
    name: string;
    image: string;
    container?: string;
  }): Promise<UpdateDeploymentImageResult>;
  deleteDeployment(input: {
    clusterId: string;
    namespace: string;
    name: string;
  }): Promise<DeleteDeploymentResult>;
}

interface PodSummaryDto {
  uid: string;
  name: string;
  namespace: string;
  phase: string;
  ready: string;
  restarts: number;
  nodeName: string;
  podIp?: string;
  image?: string;
  createdAt: string;
  labels?: Record<string, string>;
  containers?: string[];
}

interface DeploymentSummaryDto {
  uid: string;
  name: string;
  namespace: string;
  ready: string;
  replicas: number;
  upToDate: number;
  available: number;
  image: string;
  createdAt: string;
  restartedAt?: string;
  matchLabels?: Record<string, string>;
}

interface ScaleDeploymentResultDto {
  operationId: string;
  name: string;
  namespace: string;
  previousReplicas: number;
  replicas: number;
}

interface RestartDeploymentResultDto {
  operationId: string;
  name: string;
  namespace: string;
  restartedAt: string;
}

interface UpdateDeploymentImageResultDto {
  operationId: string;
  name: string;
  namespace: string;
  container: string;
  previousImage: string;
  image: string;
}

interface DeleteDeploymentResultDto {
  operationId: string;
  name: string;
  namespace: string;
}

interface ServiceSummaryDto {
  uid: string;
  name: string;
  namespace: string;
  serviceType: string;
  clusterIp: string;
  ports: string;
  createdAt: string;
  selector?: Record<string, string>;
}

interface EventSummaryDto {
  uid: string;
  name: string;
  namespace: string;
  eventType: string;
  reason: string;
  message: string;
  count: number;
  involvedKind: string;
  involvedName: string;
  source: string;
  firstTimestamp: string;
  lastTimestamp: string;
}

interface ResourceYamlDto {
  yaml: string;
  resourceVersion: string;
}

const K8S_NATIVE_CODES = new Set<string>([
  "CLUSTER_READONLY",
  "CLUSTER_NOT_CONNECTED",
  "NAMESPACE_REQUIRED",
  "K8S_FORBIDDEN",
  "K8S_NOT_FOUND",
  "K8S_API_ERROR",
  "K8S_CONFLICT",
  "CLUSTER_AUTH_FAILED",
  "CLUSTER_UNREACHABLE",
  "CLUSTER_TLS_FAILED",
]);

function normalizePhase(phase: string): PodSummary["phase"] {
  switch (phase) {
    case "Pending":
    case "Running":
    case "Succeeded":
    case "Failed":
    case "Unknown":
    case "Terminated":
    case "Terminating":
      return phase;
    default:
      return "Unknown";
  }
}

async function bridgeCall<T>(capability: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error: unknown) {
    if (error instanceof NativeCapabilityError) {
      throw error;
    }
    if (error instanceof TauriInvokeError) {
      const code = error.appError.code;
      if (K8S_NATIVE_CODES.has(code)) {
        throw new NativeCapabilityError(code as NativeErrorCode, error.appError.message, {
          retryable: error.appError.retryable,
        });
      }
      throw new NativeCapabilityError("NATIVE_BRIDGE_FAILED", error.appError.message, {
        retryable: true,
      });
    }
    const message = error instanceof Error ? error.message : `${capability} failed`;
    throw new NativeCapabilityError("NATIVE_BRIDGE_FAILED", message, { retryable: true });
  }
}

/** Default Host bridge: Tauri command names live only here. */
export function createDefaultKubernetesNativeApi(): NativeKubernetesApi {
  return {
    listContexts(kubeconfigPath?: string) {
      return bridgeCall("kubernetes.listContexts", () =>
        invokeCommand("list_kube_contexts", {
          input: { kubeconfigPath: kubeconfigPath ?? null },
        }),
      );
    },

    connect(input) {
      return bridgeCall("kubernetes.connect", () =>
        invokeCommand("connect_cluster", {
          input: {
            context: input.context,
            kubeconfigPath: input.kubeconfigPath ?? null,
            readonly: input.readonly ?? true,
            defaultNamespace: input.defaultNamespace ?? null,
          },
        }),
      );
    },

    disconnect(clusterId) {
      return bridgeCall("kubernetes.disconnect", () =>
        invokeCommand("disconnect_cluster", {
          input: { clusterId },
        }),
      );
    },

    listConnected() {
      return bridgeCall("kubernetes.listConnected", () =>
        invokeCommand("list_connected_clusters"),
      );
    },

    listNamespaces(clusterId) {
      return bridgeCall("kubernetes.listNamespaces", () =>
        invokeCommand("list_namespaces", {
          input: { clusterId },
        }),
      );
    },

    async listPods(clusterId, namespace) {
      return bridgeCall("kubernetes.listPods", async () => {
        const rows = await invokeCommand<PodSummaryDto[]>("list_pods", {
          input: { clusterId, namespace },
        });
        return rows.map((row) => ({
          uid: row.uid,
          name: row.name,
          namespace: row.namespace,
          phase: normalizePhase(row.phase),
          ready: row.ready,
          restarts: row.restarts,
          nodeName: row.nodeName,
          podIp: row.podIp ?? "",
          image: row.image ?? "",
          ageSeconds: ageSecondsFrom(row.createdAt),
          createdAt: row.createdAt,
          labels: row.labels ?? {},
          containers: row.containers ?? [],
        }));
      });
    },

    async listDeployments(clusterId, namespace) {
      return bridgeCall("kubernetes.listDeployments", async () => {
        const rows = await invokeCommand<DeploymentSummaryDto[]>("list_deployments", {
          input: { clusterId, namespace },
        });
        return rows.map((row) => ({
          uid: row.uid,
          name: row.name,
          namespace: row.namespace,
          ready: row.ready,
          replicas: row.replicas,
          upToDate: row.upToDate,
          available: row.available,
          image: row.image,
          createdAt: row.createdAt,
          restartedAt: row.restartedAt ?? "",
          matchLabels: row.matchLabels ?? {},
        }));
      });
    },

    async listServices(clusterId, namespace) {
      return bridgeCall("kubernetes.listServices", async () => {
        const rows = await invokeCommand<ServiceSummaryDto[]>("list_services", {
          input: { clusterId, namespace },
        });
        return rows.map((row) => ({
          uid: row.uid,
          name: row.name,
          namespace: row.namespace,
          serviceType: row.serviceType,
          clusterIp: row.clusterIp,
          ports: row.ports,
          createdAt: row.createdAt,
          selector: row.selector ?? {},
        }));
      });
    },

    listEvents(clusterId, namespace) {
      return bridgeCall("kubernetes.listEvents", () =>
        invokeCommand<EventSummaryDto[]>("list_events", {
          input: { clusterId, namespace },
        }),
      );
    },

    getYaml(input) {
      return bridgeCall("kubernetes.getYaml", () =>
        invokeCommand<ResourceYamlDto>("get_resource_yaml", { input }),
      );
    },

    startWatch(input) {
      return bridgeCall("kubernetes.startWatch", () =>
        invokeCommand("start_resource_watch", { input }),
      );
    },

    stopWatch(input) {
      return bridgeCall("kubernetes.stopWatch", () =>
        invokeCommand("stop_resource_watch", { input }),
      );
    },

    async scaleDeployment(input) {
      return bridgeCall("kubernetes.scaleDeployment", async () => {
        const dto = await invokeCommand<ScaleDeploymentResultDto>("scale_deployment", {
          input,
        });
        return {
          operationId: dto.operationId,
          name: dto.name,
          namespace: dto.namespace,
          previousReplicas: dto.previousReplicas,
          replicas: dto.replicas,
        };
      });
    },

    async restartDeployment(input) {
      return bridgeCall("kubernetes.restartDeployment", async () => {
        const dto = await invokeCommand<RestartDeploymentResultDto>("restart_deployment", {
          input,
        });
        return {
          operationId: dto.operationId,
          name: dto.name,
          namespace: dto.namespace,
          restartedAt: dto.restartedAt,
        };
      });
    },

    async updateDeploymentImage(input) {
      return bridgeCall("kubernetes.updateDeploymentImage", async () => {
        const dto = await invokeCommand<UpdateDeploymentImageResultDto>("update_deployment_image", {
          input,
        });
        return {
          operationId: dto.operationId,
          name: dto.name,
          namespace: dto.namespace,
          container: dto.container,
          previousImage: dto.previousImage,
          image: dto.image,
        };
      });
    },

    async deleteDeployment(input) {
      return bridgeCall("kubernetes.deleteDeployment", async () => {
        const dto = await invokeCommand<DeleteDeploymentResultDto>("delete_deployment", {
          input,
        });
        return {
          operationId: dto.operationId,
          name: dto.name,
          namespace: dto.namespace,
        };
      });
    },
  };
}

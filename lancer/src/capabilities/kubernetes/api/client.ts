/**
 * V2 Kubernetes Capability API — UI → native IPC, no plugin.apply.
 */
import type { ClusterIdentity, KubeContextSummary } from "@/entities/cluster/types";
import type {
  DeleteDeploymentResult,
  DeploymentSummary,
  RestartDeploymentResult,
  ScaleDeploymentResult,
  UpdateDeploymentImageResult,
} from "@/entities/deployment/types";
import type { EventSummary } from "@/entities/event/types";
import type { LogSessionInfo, LogWindow } from "@/entities/log/types";
import type { PodSummary } from "@/entities/pod/types";
import type { ServiceSummary } from "@/entities/service/types";
import type { ResourceWatchKind } from "@/entities/watch/types";
import type { ManifestResourceKind, ResourceYaml } from "@/entities/yaml/types";
import { createDefaultKubernetesNativeApi } from "@/native/kubernetes";
import { createDefaultLogsNativeApi } from "@/native/logs";
import type {
  NativeLogFindAtTimeInput,
  NativeLogFindAtTimeResult,
  NativeLogSearchInput,
  NativeLogSearchResult,
} from "@/native/types";
import { kubernetesPodExecApi } from "./exec";

const k8s = createDefaultKubernetesNativeApi();
const logs = createDefaultLogsNativeApi();

export const kubernetesApi = {
  listContexts(kubeconfigPath?: string): Promise<KubeContextSummary[]> {
    return k8s.listContexts(kubeconfigPath);
  },

  listConnected(): Promise<ClusterIdentity[]> {
    return k8s.listConnected();
  },

  connect(input: {
    context: string;
    kubeconfigPath?: string;
    readonly?: boolean;
    defaultNamespace?: string;
  }): Promise<ClusterIdentity> {
    return k8s.connect(input);
  },

  disconnect(clusterId: string): Promise<void> {
    return k8s.disconnect(clusterId);
  },

  listNamespaces(clusterId: string): Promise<string[]> {
    return k8s.listNamespaces(clusterId);
  },

  listPods(clusterId: string, namespace: string): Promise<PodSummary[]> {
    return k8s.listPods(clusterId, namespace);
  },

  listDeployments(clusterId: string, namespace: string): Promise<DeploymentSummary[]> {
    return k8s.listDeployments(clusterId, namespace);
  },

  listServices(clusterId: string, namespace: string): Promise<ServiceSummary[]> {
    return k8s.listServices(clusterId, namespace);
  },

  listEvents(clusterId: string, namespace: string): Promise<EventSummary[]> {
    return k8s.listEvents(clusterId, namespace);
  },

  getYaml(input: {
    clusterId: string;
    namespace: string;
    kind: ManifestResourceKind;
    name: string;
  }): Promise<ResourceYaml> {
    return k8s.getYaml(input);
  },

  startWatch(input: {
    clusterId: string;
    namespace: string;
    kind: ResourceWatchKind;
  }): Promise<void> {
    return k8s.startWatch(input);
  },

  stopWatch(input: {
    clusterId: string;
    namespace: string;
    kind: ResourceWatchKind;
  }): Promise<void> {
    return k8s.stopWatch(input);
  },

  openLogs(input: {
    connectionId?: string;
    namespace?: string;
    pod?: string;
    container?: string;
    follow?: boolean;
    previous?: boolean;
    sinceSeconds?: number;
    tailLines?: number;
  }): Promise<{ sessionId: string; fromCache?: boolean }> {
    return logs.open({
      provider: "kubernetes",
      ...input,
    });
  },

  pauseLogs(sessionId: string, paused: boolean): Promise<LogSessionInfo> {
    if (!logs.setPaused) {
      return Promise.reject(new Error("logs.setPaused unavailable"));
    }
    return logs.setPaused(sessionId, paused);
  },

  readLogWindow(input: {
    sessionId: string;
    offset: number;
    limit: number;
  }): Promise<LogWindow> {
    return logs.readWindow(input);
  },

  closeLogs(sessionId: string): Promise<void> {
    return logs.close(sessionId);
  },

  getLogSession(sessionId: string): Promise<LogSessionInfo> {
    return logs.getSession(sessionId);
  },

  searchLogs(input: NativeLogSearchInput): Promise<NativeLogSearchResult> {
    if (!logs.search) {
      return Promise.reject(new Error("logs.search unavailable"));
    }
    return logs.search(input);
  },

  cancelLogSearch(sessionId: string): Promise<void> {
    if (!logs.cancelSearch) {
      return Promise.resolve();
    }
    return logs.cancelSearch(sessionId);
  },

  findLogLineAtTime(input: NativeLogFindAtTimeInput): Promise<NativeLogFindAtTimeResult> {
    if (!logs.findLineAtTime) {
      return Promise.reject(new Error("logs.findLineAtTime unavailable"));
    }
    return logs.findLineAtTime(input);
  },

  scaleDeployment(input: {
    clusterId: string;
    namespace: string;
    name: string;
    replicas: number;
  }): Promise<ScaleDeploymentResult> {
    return k8s.scaleDeployment(input);
  },

  restartDeployment(input: {
    clusterId: string;
    namespace: string;
    name: string;
  }): Promise<RestartDeploymentResult> {
    return k8s.restartDeployment(input);
  },

  updateDeploymentImage(input: {
    clusterId: string;
    namespace: string;
    name: string;
    image: string;
    container?: string;
  }): Promise<UpdateDeploymentImageResult> {
    return k8s.updateDeploymentImage(input);
  },

  deleteDeployment(input: {
    clusterId: string;
    namespace: string;
    name: string;
  }): Promise<DeleteDeploymentResult> {
    return k8s.deleteDeployment(input);
  },

  exec: kubernetesPodExecApi,
};

export type KubernetesApi = typeof kubernetesApi;

import { describe, expect, it } from "vitest";
import type { ClusterIdentity } from "@/entities/cluster/types";
import { useKubernetesWorkspaceStore } from "./kubernetes-workspace-store";

const sampleCluster: ClusterIdentity = {
  id: "c1",
  displayName: "demo",
  apiServer: "https://127.0.0.1",
  caFingerprint: "aa:bb",
  context: "demo",
  riskLevel: "LOCAL",
  tlsInsecure: false,
  readonly: true,
  credentialMode: "kubeconfigPath",
  kubeconfigPathDisplay: "~/.kube/config",
  capabilities: {
    canListPods: true,
    canGetPods: true,
    canDeletePods: false,
    canPatchDeployments: false,
    canDeleteDeployments: false,
    canCreatePodsExec: false,
    canGetPodsLog: true,
    ssarOk: true,
  },
};

describe("kubernetes-workspace-store", () => {
  it("reset clears domain selection back to defaults", () => {
    useKubernetesWorkspaceStore.getState().setActiveCluster(sampleCluster);
    useKubernetesWorkspaceStore.getState().setNamespace("kube-system");
    useKubernetesWorkspaceStore.getState().setResourceListKind("deployment");
    useKubernetesWorkspaceStore.getState().setSelectedResourceId("uid-1");

    useKubernetesWorkspaceStore.getState().reset();

    const state = useKubernetesWorkspaceStore.getState();
    expect(state.activeClusterId).toBeNull();
    expect(state.activeCluster).toBeNull();
    expect(state.namespace).toBe("default");
    expect(state.resourceListKind).toBe("deployment");
    expect(state.selectedResourceId).toBeNull();
  });
});

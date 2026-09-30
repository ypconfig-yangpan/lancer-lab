export type EnvironmentRiskLevel = "LOCAL" | "DEV" | "TEST" | "STAGING" | "PROD";

/** V1: path reference only — never embed kubeconfig content. */
export type CredentialMode = "kubeconfigPath";

export interface ClusterCapabilities {
  canListPods: boolean;
  canGetPods: boolean;
  canDeletePods: boolean;
  canPatchDeployments: boolean;
  canDeleteDeployments: boolean;
  canCreatePodsExec: boolean;
  canGetPodsLog: boolean;
  ssarOk: boolean;
}

export interface ClusterIdentity {
  id: string;
  displayName: string;
  apiServer: string;
  caFingerprint: string;
  context: string;
  riskLevel: EnvironmentRiskLevel;
  tlsInsecure: boolean;
  readonly: boolean;
  credentialMode: CredentialMode;
  kubeconfigPathDisplay: string;
  capabilities: ClusterCapabilities;
}

export interface KubeContextSummary {
  name: string;
  cluster: string;
  user: string;
  namespace: string | null;
  isCurrent: boolean;
}

export interface AppErrorDto {
  code: string;
  message: string;
  detail: string | null;
  retryable: boolean;
}

export function isAppErrorDto(value: unknown): value is AppErrorDto {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "string" &&
    typeof record.message === "string" &&
    (record.detail === null || typeof record.detail === "string" || record.detail === undefined) &&
    typeof record.retryable === "boolean"
  );
}

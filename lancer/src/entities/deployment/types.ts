export interface DeploymentSummary {
  uid: string;
  name: string;
  namespace: string;
  ready: string;
  /** Desired replicas (spec). */
  replicas: number;
  upToDate: number;
  available: number;
  image: string;
  createdAt: string;
  /** Pod template annotation kubectl.kubernetes.io/restartedAt (ISO8601). */
  restartedAt: string;
  /** Spec selector matchLabels — used to resolve backing pods. */
  matchLabels: Record<string, string>;
}

export interface ScaleDeploymentResult {
  operationId: string;
  name: string;
  namespace: string;
  previousReplicas: number;
  replicas: number;
}

export interface RestartDeploymentResult {
  operationId: string;
  name: string;
  namespace: string;
  /** ISO8601 written to pod template annotation. */
  restartedAt: string;
}

export interface UpdateDeploymentImageResult {
  operationId: string;
  name: string;
  namespace: string;
  container: string;
  previousImage: string;
  image: string;
}

export interface DeleteDeploymentResult {
  operationId: string;
  name: string;
  namespace: string;
}

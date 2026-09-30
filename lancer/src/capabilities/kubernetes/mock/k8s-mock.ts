/** Pure frontend mock catalog for K8s Dashboard (no OrbStack / kube). */

export interface MockK8sStats {
  nodesReady: string;
  podsReady: string;
  cpuPercent: number;
  memPercent: number;
}

export interface MockDeployment {
  id: string;
  name: string;
  namespace: string;
  type: "Deployment";
  replicas: string;
  status: "Running" | "Degraded";
  updatedAt: string;
  image: string;
  createdAt: string;
}

export interface MockPod {
  id: string;
  name: string;
  status: "Running" | "Pending" | "Failed";
  ip: string;
  node: string;
  restarts: number;
  deploymentId: string;
}

export interface MockEvent {
  id: string;
  time: string;
  type: "Normal" | "Warning";
  reason: string;
  message: string;
}

export const K8S_MOCK_CLUSTER = "prod-cluster";

export const K8S_MOCK_STATS: MockK8sStats = {
  nodesReady: "5/5",
  podsReady: "24/24",
  cpuPercent: 28,
  memPercent: 42,
};

export const K8S_MOCK_DEPLOYMENTS: MockDeployment[] = [
  {
    id: "dep-api",
    name: "api-server",
    namespace: "default",
    type: "Deployment",
    replicas: "3/3",
    status: "Running",
    updatedAt: "2024-09-10 14:23",
    image: "acme/api:1.2.3",
    createdAt: "2024-09-01 09:00",
  },
  {
    id: "dep-web",
    name: "web-frontend",
    namespace: "default",
    type: "Deployment",
    replicas: "2/2",
    status: "Running",
    updatedAt: "2024-09-09 11:02",
    image: "acme/web:2.0.1",
    createdAt: "2024-08-20 10:00",
  },
  {
    id: "dep-worker",
    name: "billing-worker",
    namespace: "billing",
    type: "Deployment",
    replicas: "1/2",
    status: "Degraded",
    updatedAt: "2024-09-10 08:15",
    image: "acme/worker:0.9.4",
    createdAt: "2024-07-12 16:30",
  },
  {
    id: "dep-gateway",
    name: "ingress-gateway",
    namespace: "infra",
    type: "Deployment",
    replicas: "2/2",
    status: "Running",
    updatedAt: "2024-09-08 19:40",
    image: "acme/gateway:1.4.0",
    createdAt: "2024-06-01 12:00",
  },
];

export const K8S_MOCK_PODS: MockPod[] = [
  {
    id: "pod-api-1",
    name: "api-server-7d9f8b-a1",
    status: "Running",
    ip: "10.0.1.11",
    node: "node-1",
    restarts: 0,
    deploymentId: "dep-api",
  },
  {
    id: "pod-api-2",
    name: "api-server-7d9f8b-b2",
    status: "Running",
    ip: "10.0.1.12",
    node: "node-2",
    restarts: 1,
    deploymentId: "dep-api",
  },
  {
    id: "pod-api-3",
    name: "api-server-7d9f8b-c3",
    status: "Running",
    ip: "10.0.1.13",
    node: "node-1",
    restarts: 0,
    deploymentId: "dep-api",
  },
  {
    id: "pod-web-1",
    name: "web-frontend-5c4d-x1",
    status: "Running",
    ip: "10.0.2.21",
    node: "node-3",
    restarts: 0,
    deploymentId: "dep-web",
  },
  {
    id: "pod-web-2",
    name: "web-frontend-5c4d-x2",
    status: "Running",
    ip: "10.0.2.22",
    node: "node-2",
    restarts: 0,
    deploymentId: "dep-web",
  },
  {
    id: "pod-worker-1",
    name: "billing-worker-9ab-1",
    status: "Running",
    ip: "10.0.3.31",
    node: "node-4",
    restarts: 3,
    deploymentId: "dep-worker",
  },
  {
    id: "pod-worker-2",
    name: "billing-worker-9ab-2",
    status: "Pending",
    ip: "—",
    node: "—",
    restarts: 0,
    deploymentId: "dep-worker",
  },
];

export const K8S_MOCK_EVENTS: MockEvent[] = [
  {
    id: "ev1",
    time: "14:23:01",
    type: "Normal",
    reason: "ScalingReplicaSet",
    message: "Scaled up replica set api-server-7d9f8b to 3",
  },
  {
    id: "ev2",
    time: "14:22:48",
    type: "Normal",
    reason: "Pulled",
    message: "Successfully pulled image acme/api:1.2.3",
  },
  {
    id: "ev3",
    time: "14:20:11",
    type: "Warning",
    reason: "FailedScheduling",
    message: "0/5 nodes available: insufficient cpu (transient)",
  },
  {
    id: "ev4",
    time: "14:18:02",
    type: "Normal",
    reason: "SuccessfulCreate",
    message: "Created pod: api-server-7d9f8b-c3",
  },
];

export const K8S_MOCK_LOGS = [
  "2024-09-10T14:23:11Z INFO  listening on :8080",
  "2024-09-10T14:23:12Z INFO  ready probes ok",
  "2024-09-10T14:23:40Z INFO  GET /healthz 200 1.2ms",
  "2024-09-10T14:24:01Z INFO  GET /v1/users 200 18ms",
  "2024-09-10T14:24:15Z WARN  slow query 210ms SELECT * FROM accounts",
  "2024-09-10T14:24:33Z INFO  POST /v1/orders 201 42ms",
  "2024-09-10T14:25:02Z INFO  GET /metrics 200 0.8ms",
];

export const K8S_MOCK_CPU_SERIES = [18, 22, 20, 28, 26, 30, 24, 28, 32, 27, 25, 28];
export const K8S_MOCK_MEM_SERIES = [35, 36, 38, 40, 39, 42, 41, 43, 42, 44, 42, 42];

export const K8S_MOCK_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  template:
    metadata:
      labels:
        app: api-server
    spec:
      containers:
        - name: api
          image: acme/api:1.2.3
          ports:
            - containerPort: 8080
`;

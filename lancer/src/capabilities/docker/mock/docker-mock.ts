/** Pure frontend mock for Docker Dashboard (no local engine IPC). */

export interface MockDockerContainer {
  id: string;
  name: string;
  image: string;
  status: "Running" | "Stopped";
  ports: string;
  uptime: string;
  ip: string;
  startedAt: string;
  cpuPercent: number;
  memPercent: number;
}

export const DOCKER_MOCK_STATS = {
  containers: 12,
  images: 6,
  cpuPercent: 28,
  memPercent: 43,
};

export const DOCKER_MOCK_CONTAINERS: MockDockerContainer[] = [
  {
    id: "c1",
    name: "lancer-api-1",
    image: "acme/api:1.2.3",
    status: "Running",
    ports: "8080:8080",
    uptime: "2d 4h",
    ip: "172.17.0.2",
    startedAt: "2024-09-08 10:00",
    cpuPercent: 28,
    memPercent: 62,
  },
  {
    id: "c2",
    name: "lancer-redis",
    image: "redis:7",
    status: "Running",
    ports: "6379:6379",
    uptime: "5d 1h",
    ip: "172.17.0.3",
    startedAt: "2024-09-05 08:20",
    cpuPercent: 4,
    memPercent: 18,
  },
  {
    id: "c3",
    name: "lancer-postgres",
    image: "postgres:16",
    status: "Running",
    ports: "5432:5432",
    uptime: "5d 1h",
    ip: "172.17.0.4",
    startedAt: "2024-09-05 08:21",
    cpuPercent: 12,
    memPercent: 45,
  },
  {
    id: "c4",
    name: "old-worker",
    image: "acme/worker:0.8",
    status: "Stopped",
    ports: "—",
    uptime: "—",
    ip: "—",
    startedAt: "—",
    cpuPercent: 0,
    memPercent: 0,
  },
  {
    id: "c5",
    name: "lancer-nginx",
    image: "nginx:1.27",
    status: "Running",
    ports: "80:80",
    uptime: "1d 3h",
    ip: "172.17.0.5",
    startedAt: "2024-09-09 12:00",
    cpuPercent: 2,
    memPercent: 8,
  },
];

export const DOCKER_MOCK_LOGS = [
  "time=\"2024-09-10T14:20:01Z\" level=info msg=\"server started\"",
  "GET /health 200 0.4ms",
  "GET /v1/ping 200 1.1ms",
  "POST /v1/session 201 12ms",
  "WARN connection pool wait 80ms",
  "GET /metrics 200 0.6ms",
];

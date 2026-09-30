/** Catalog mock when Docker Engine is unreachable. */

export interface DockerTreeNode {
  id: string;
  label: string;
  children?: DockerTreeNode[];
  data?: Record<string, unknown>;
}

export interface DockerContainerRow {
  id: string;
  name: string;
  host: string;
  group: string;
  image: string;
  status: string;
  ports: string;
  cpu: string;
  memory: string;
  uptime: string;
  labels: Record<string, string>;
  notes?: string;
  health?: string;
  imageId?: string;
  created?: string;
  command?: string;
  restartPolicy?: string;
  network?: string;
  ipAddress?: string;
  mounts?: string;
}

export const DOCKER_TREE: DockerTreeNode[] = [
  {
    id: "env:local",
    label: "Local",
    data: { host: "local" },
    children: [
      { id: "env:local:containers", label: "Containers", data: { host: "local", group: "all" } },
      { id: "env:local:images", label: "Images", data: { host: "local", group: "images" } },
      { id: "env:local:volumes", label: "Volumes", data: { host: "local", group: "volumes" } },
    ],
  },
  {
    id: "env:remote",
    label: "Remote Hosts",
    data: { host: "remote" },
    children: [
      {
        id: "env:remote:staging",
        label: "staging-host",
        data: { host: "staging", group: "all" },
      },
      {
        id: "env:remote:prod1",
        label: "prod-host-1",
        data: { host: "prod1", group: "all" },
      },
      {
        id: "env:remote:prod2",
        label: "prod-host-2",
        data: { host: "prod2", group: "all" },
      },
    ],
  },
];

export const DOCKER_CONTAINERS: DockerContainerRow[] = [
  {
    id: "ctr-nginx",
    name: "nginx",
    host: "local",
    group: "running",
    image: "nginx:1.27",
    status: "Running",
    ports: "80:8080",
    cpu: "2%",
    memory: "64MB",
    uptime: "3d 2h",
    health: "Healthy",
    imageId: "sha256:a1b2c3d4e5f6…",
    created: "2026-08-20T10:00:00Z",
    command: "/docker-entrypoint.sh nginx -g 'daemon off;'",
    restartPolicy: "Unless-stopped",
    network: "bridge",
    ipAddress: "172.17.0.2",
    mounts: "/var/www → /usr/share/nginx/html",
    labels: { app: "edge" },
    notes: "Catalog mock — Docker Engine later via dockerApi.",
  },
  {
    id: "ctr-redis",
    name: "redis-cache",
    host: "local",
    group: "running",
    image: "redis:7",
    status: "Running",
    ports: "6379",
    cpu: "1%",
    memory: "32MB",
    uptime: "3d 2h",
    labels: { app: "cache" },
    notes: "Mock cache container.",
  },
  {
    id: "ctr-postgres",
    name: "billing-db",
    host: "local",
    group: "running",
    image: "postgres:16",
    status: "Running",
    ports: "5432",
    cpu: "5%",
    memory: "256MB",
    uptime: "12d",
    labels: { app: "billing" },
    notes: "Mock database.",
  },
  {
    id: "ctr-old",
    name: "old-batch",
    host: "local",
    group: "exited",
    image: "busybox:1.36",
    status: "Exited",
    ports: "—",
    cpu: "—",
    memory: "—",
    uptime: "—",
    labels: { job: "batch" },
    notes: "Exited mock container.",
  },
];

export function filterDockerContainers(filter: Record<string, unknown> = {}): DockerContainerRow[] {
  const group = typeof filter.group === "string" ? filter.group : undefined;
  if (group === "images" || group === "volumes") {
    return [];
  }
  return DOCKER_CONTAINERS.filter((row) => {
    for (const [key, value] of Object.entries(filter)) {
      if (key === "nodeId") {
        continue;
      }
      if (key === "group" && (value === "all" || value === undefined)) {
        continue;
      }
      if (
        typeof value === "string" &&
        key in row &&
        (row as unknown as Record<string, unknown>)[key] !== value
      ) {
        return false;
      }
    }
    return true;
  });
}

export function getDockerContainer(id: string): DockerContainerRow | null {
  return DOCKER_CONTAINERS.find((row) => row.id === id) ?? null;
}

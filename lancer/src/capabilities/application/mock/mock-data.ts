export interface ApplicationSummary {
  id: string;
  name: string;
  env: "dev" | "prod" | "staging";
  group: "DEV" | "PROD" | "STAGING";
  owner: string;
  status: "Healthy" | "Degraded" | "Unknown";
  version: string;
  description: string;
  repository: string;
  tags: string[];
}

export const APPLICATION_CATALOG: ApplicationSummary[] = [
  {
    id: "app-billing",
    name: "billing",
    env: "prod",
    group: "PROD",
    owner: "yangpan",
    status: "Healthy",
    version: "1.4.0",
    description: "Mission critical billing service for checkout and invoices.",
    repository: "github.com/acme/billing",
    tags: ["nodejs", "express", "postgres"],
  },
  {
    id: "app-iam",
    name: "iam",
    env: "dev",
    group: "DEV",
    owner: "platform",
    status: "Healthy",
    version: "0.9.2",
    description: "Identity and access management.",
    repository: "github.com/acme/iam",
    tags: ["go", "oidc"],
  },
  {
    id: "app-checkout",
    name: "checkout",
    env: "staging",
    group: "STAGING",
    owner: "payments",
    status: "Degraded",
    version: "2.1.0-rc.1",
    description: "Checkout orchestration service.",
    repository: "github.com/acme/checkout",
    tags: ["java", "kafka"],
  },
  {
    id: "app-notification",
    name: "notification",
    env: "dev",
    group: "DEV",
    owner: "platform",
    status: "Healthy",
    version: "0.3.1",
    description: "Push and email notification gateway.",
    repository: "github.com/acme/notification",
    tags: ["go", "queue"],
  },
  {
    id: "app-users",
    name: "users",
    env: "prod",
    group: "PROD",
    owner: "identity",
    status: "Healthy",
    version: "1.2.0",
    description: "User profile and preference service.",
    repository: "github.com/acme/users",
    tags: ["java", "postgres"],
  },
];

export interface ApplicationEvent {
  id: string;
  at: string;
  provider: string;
  description: string;
  resource: string;
  age: string;
}

export const APPLICATION_EVENTS: ApplicationEvent[] = [
  {
    id: "e1",
    at: "15:28:01",
    provider: "Kubernetes",
    description: "Scaled up deployment billing-api to 3",
    resource: "Deployment/billing-api",
    age: "2m ago",
  },
  {
    id: "e2",
    at: "15:20:44",
    provider: "Argo CD",
    description: "Synced application billing to 1.4.0",
    resource: "Application/billing",
    age: "9m ago",
  },
  {
    id: "e3",
    at: "15:12:10",
    provider: "Jenkins",
    description: "Build #101 succeeded on main",
    resource: "Job/billing-ci",
    age: "18m ago",
  },
  {
    id: "e4",
    at: "14:58:02",
    provider: "GitHub",
    description: "Pushed 3f2a1c7 to main",
    resource: "acme/billing",
    age: "32m ago",
  },
];

/** Fallback stage copy when Provider slots are empty (catalog demo). */
export const STAGE_FALLBACKS: Record<
  string,
  { provider: string; primary: string; secondary: string; tone: "success" | "warning" | "info" }
> = {
  "application.source": {
    provider: "GitHub",
    primary: "main",
    secondary: "3f2a1c7 · 32m ago",
    tone: "info",
  },
  "application.build": {
    provider: "Jenkins",
    primary: "Build #101",
    secondary: "Success",
    tone: "success",
  },
  "application.release": {
    provider: "Argo CD",
    primary: "Synced",
    secondary: "1.4.0",
    tone: "success",
  },
  "application.runtime": {
    provider: "Kubernetes",
    primary: "3/3 Healthy",
    secondary: "billing-prod",
    tone: "success",
  },
  "application.observability": {
    provider: "Prometheus",
    primary: "Latency p99 42ms",
    secondary: "Error rate 0.1%",
    tone: "info",
  },
};

export function getApplication(payload: unknown): ApplicationSummary | null {
  const id =
    payload && typeof payload === "object" ? (payload as { id?: unknown }).id : undefined;
  if (typeof id !== "string") {
    return null;
  }
  return APPLICATION_CATALOG.find((app) => app.id === id) ?? null;
}

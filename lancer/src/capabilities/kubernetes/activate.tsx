import type { ModuleContext } from "@/shell/types";
import { installK8sWatchInvalidation } from "./connect/install-k8s-watch-invalidation";
import { KubernetesDashboardApp } from "./views/kubernetes-dashboard-app";

/**
 * Kubernetes capability — live Dashboard (Rancher test cluster).
 */
export function activateKubernetesCapability(context: ModuleContext): void {
  const queryClient = context.queries.getClient();
  if (queryClient) {
    // Watch ADDED/MODIFIED → invalidate list queries within ~300ms
    installK8sWatchInvalidation(queryClient, context.disposables);
  }

  context.views.register({
    id: "kubernetes.resources",
    title: "Kubernetes",
    location: "workspace",
    factory: () => <KubernetesDashboardApp />,
  });
}

export function deactivateKubernetesCapability(): void {
  // disposables cleared by module scope
}

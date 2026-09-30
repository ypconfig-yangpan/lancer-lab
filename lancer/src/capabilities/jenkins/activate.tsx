import type { ModuleContext } from "@/shell/types";
import { installJenkinsActivityListen } from "./connect/install-jenkins-activity-listen";
import { JenkinsDashboardApp } from "./views/jenkins-dashboard-app";

/**
 * Jenkins capability — live HTTP via ~/.lancer/jenkins.json.
 */
export function activateJenkinsCapability(context: ModuleContext): void {
  const queryClient = context.queries.getClient();
  if (queryClient) {
    installJenkinsActivityListen(queryClient, context.disposables);
  }

  context.views.register({
    id: "jenkins.resources",
    title: "Jenkins",
    location: "workspace",
    factory: () => <JenkinsDashboardApp />,
  });
}

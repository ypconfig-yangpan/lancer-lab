import type { ModuleContext } from "@/shell/types";
import { CredentialsHome } from "./views/credentials-home";

export const CREDENTIALS_ACTIVITY_ID = "credentials";
/** @deprecated alias */
export const CONNECTIONS_ACTIVITY_ID = CREDENTIALS_ACTIVITY_ID;

/**
 * Credentials capability — paste kubeconfig / Jenkins form (stored under ~/.lancer).
 * Activity is registered by ShellModuleRegistry from bootstrap; here only views.
 */
export function activateCredentialsCapability(context: ModuleContext): void {
  context.views.register({
    id: "credentials.home",
    title: "凭证",
    location: "workspace",
    factory: () => <CredentialsHome />,
  });
}

/** @deprecated */
export const activateConnectionsCapability = activateCredentialsCapability;

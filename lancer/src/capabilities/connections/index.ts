/**
 * Connections / Credentials capability — paste kubeconfig & Jenkins form.
 *
 * Wire: `activateCredentialsCapability(context)` from capability-bootstrap.
 */
export {
  activateCredentialsCapability,
  activateConnectionsCapability,
  CREDENTIALS_ACTIVITY_ID,
  CONNECTIONS_ACTIVITY_ID,
} from "./activate";
export { CredentialsHome } from "./views/credentials-home";
export { ConnectionsTree } from "./views/connections-tree";
export { ConnectionsHome } from "./views/connections-home";

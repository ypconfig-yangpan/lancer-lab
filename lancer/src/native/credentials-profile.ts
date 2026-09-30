import { invokeCommand, TauriInvokeError } from "@/shared/tauri";
import { NativeCapabilityError, type NativeErrorCode } from "./errors";

export interface NativeKubeContextSummary {
  name: string;
  cluster: string;
  user: string;
  namespace: string | null;
  isCurrent: boolean;
}

export interface NativeKubeCredentialStatus {
  configured: boolean;
  pathDisplay: string;
  absolutePath: string;
  preferredContext: string | null;
  defaultNamespace: string | null;
  contexts: NativeKubeContextSummary[];
}

export interface NativeImportKubeconfigResult {
  pathDisplay: string;
  absolutePath: string;
  preferredContext: string | null;
  contexts: NativeKubeContextSummary[];
}

export interface NativeJenkinsLocalConfig {
  configured: boolean;
  pathDisplay: string;
  baseUrl: string;
  username: string;
  apiTokenSet: boolean;
  webhookEnabled: boolean;
  webhookPort: number;
  webhookTokenSet: boolean;
}

export interface NativeKubeconfigYaml {
  configured: boolean;
  pathDisplay: string;
  yaml: string;
}

export interface NativeCredentialsProfileApi {
  importKubeconfig(input: {
    yaml: string;
    preferredContext?: string;
    defaultNamespace?: string;
  }): Promise<NativeImportKubeconfigResult>;
  getKubeStatus(): Promise<NativeKubeCredentialStatus>;
  getKubeconfigYaml(): Promise<NativeKubeconfigYaml>;
  setKubeContext(input: {
    context: string;
    defaultNamespace?: string;
  }): Promise<NativeKubeCredentialStatus>;
  getJenkinsConfig(): Promise<NativeJenkinsLocalConfig>;
  saveJenkinsConfig(input: {
    baseUrl: string;
    username: string;
    apiToken?: string;
    webhookEnabled?: boolean;
    webhookPort?: number;
    webhookToken?: string | null;
  }): Promise<NativeJenkinsLocalConfig>;
}

const CODES = new Set([
  "CLUSTER_CONFIG_INVALID",
  "CREDENTIAL_STORE_ERROR",
  "JENKINS_CONFIG_INVALID",
  "JENKINS_AUTH_FAILED",
  "JENKINS_UNREACHABLE",
  "JENKINS_HTTP_ERROR",
  "JENKINS_NOT_CONNECTED",
  "JENKINS_BAD_REQUEST",
  "CLUSTER_AUTH_FAILED",
  "CLUSTER_UNREACHABLE",
  "CLUSTER_TLS_FAILED",
]);

async function bridgeCall<T>(capability: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error: unknown) {
    if (error instanceof NativeCapabilityError) throw error;
    if (error instanceof TauriInvokeError) {
      const code = error.appError.code;
      if (CODES.has(code)) {
        throw new NativeCapabilityError(code as NativeErrorCode, error.appError.message, {
          retryable: error.appError.retryable,
        });
      }
      throw new NativeCapabilityError("NATIVE_BRIDGE_FAILED", error.appError.message, {
        retryable: true,
      });
    }
    const message = error instanceof Error ? error.message : `${capability} failed`;
    throw new NativeCapabilityError("NATIVE_BRIDGE_FAILED", message, { retryable: true });
  }
}

export function createCredentialsProfileApi(): NativeCredentialsProfileApi {
  return {
    importKubeconfig(input) {
      return bridgeCall("credentials.importKubeconfig", () =>
        invokeCommand<NativeImportKubeconfigResult>("credentials_import_kubeconfig", {
          input: {
            yaml: input.yaml,
            preferredContext: input.preferredContext,
            defaultNamespace: input.defaultNamespace,
          },
        }),
      );
    },
    getKubeStatus() {
      return bridgeCall("credentials.getKubeStatus", () =>
        invokeCommand<NativeKubeCredentialStatus>("credentials_get_kube_status"),
      );
    },
    getKubeconfigYaml() {
      return bridgeCall("credentials.getKubeconfigYaml", () =>
        invokeCommand<NativeKubeconfigYaml>("credentials_get_kubeconfig_yaml"),
      );
    },
    setKubeContext(input) {
      return bridgeCall("credentials.setKubeContext", () =>
        invokeCommand<NativeKubeCredentialStatus>("credentials_set_kube_context", {
          input: {
            context: input.context,
            defaultNamespace: input.defaultNamespace,
          },
        }),
      );
    },
    getJenkinsConfig() {
      return bridgeCall("credentials.getJenkinsConfig", () =>
        invokeCommand<NativeJenkinsLocalConfig>("credentials_get_jenkins_config"),
      );
    },
    saveJenkinsConfig(input) {
      return bridgeCall("credentials.saveJenkinsConfig", () =>
        invokeCommand<NativeJenkinsLocalConfig>("credentials_save_jenkins_config", {
          input: {
            baseUrl: input.baseUrl,
            username: input.username,
            apiToken: input.apiToken,
            webhookEnabled: input.webhookEnabled,
            webhookPort: input.webhookPort,
            webhookToken: input.webhookToken,
          },
        }),
      );
    },
  };
}

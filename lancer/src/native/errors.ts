export type NativeErrorCode =
  | "NATIVE_UNAVAILABLE"
  | "NATIVE_FORBIDDEN"
  | "NATIVE_BRIDGE_FAILED"
  | "LOG_FILE_NOT_FOUND"
  | "LOG_DISK_FULL"
  | "LOG_STREAM_FAILED"
  | "LOG_STREAM_INTERRUPTED"
  | "DOCKER_UNAVAILABLE"
  | "DOCKER_ENGINE_FAILED"
  | "TERMINAL_OPEN_FAILED"
  | "TERMINAL_DISCONNECTED"
  | "TERMINAL_PERMISSION_DENIED"
  | "CLUSTER_READONLY"
  | "CLUSTER_NOT_CONNECTED"
  | "NAMESPACE_REQUIRED"
  | "K8S_FORBIDDEN"
  | "K8S_NOT_FOUND"
  | "K8S_API_ERROR"
  | "K8S_CONFLICT"
  | "CLUSTER_AUTH_FAILED"
  | "CLUSTER_UNREACHABLE"
  | "CLUSTER_TLS_FAILED"
  | "CLUSTER_CONFIG_INVALID"
  | "CREDENTIAL_STORE_ERROR"
  | "JENKINS_CONFIG_INVALID"
  | "JENKINS_AUTH_FAILED"
  | "JENKINS_UNREACHABLE"
  | "JENKINS_HTTP_ERROR"
  | "JENKINS_NOT_CONNECTED"
  | "JENKINS_BAD_REQUEST";

export class NativeCapabilityError extends Error {
  readonly code: NativeErrorCode;
  readonly retryable: boolean;

  constructor(code: NativeErrorCode, message: string, options?: { retryable?: boolean }) {
    super(message);
    this.name = "NativeCapabilityError";
    this.code = code;
    this.retryable = options?.retryable ?? false;
  }
}

export function isNativeCapabilityError(error: unknown): error is NativeCapabilityError {
  return error instanceof NativeCapabilityError;
}

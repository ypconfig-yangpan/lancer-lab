import { isNativeCapabilityError } from "@/native/errors";
import { TauriInvokeError } from "@/shared/tauri";

export function formatAppError(error: unknown): {
  code: string;
  message: string;
  detail: string | null;
} {
  if (error instanceof TauriInvokeError) {
    return {
      code: error.appError.code,
      message: error.appError.message,
      detail: error.appError.detail,
    };
  }
  if (isNativeCapabilityError(error)) {
    return { code: error.code, message: error.message, detail: null };
  }
  if (error instanceof Error) {
    return { code: "UNKNOWN", message: error.message, detail: null };
  }
  return { code: "UNKNOWN", message: "unexpected error", detail: null };
}

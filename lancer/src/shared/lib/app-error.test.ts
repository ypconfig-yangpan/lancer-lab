import { describe, expect, it } from "vitest";
import { formatAppError } from "@/shared/lib/app-error";
import { TauriInvokeError } from "@/shared/tauri";

describe("formatAppError", () => {
  it("uses AppErrorDto fields from TauriInvokeError", () => {
    const formatted = formatAppError(
      new TauriInvokeError({
        code: "CLUSTER_NOT_CONNECTED",
        message: "cluster is not connected",
        detail: null,
        retryable: false,
      }),
    );
    expect(formatted).toEqual({
      code: "CLUSTER_NOT_CONNECTED",
      message: "cluster is not connected",
      detail: null,
    });
  });

  it("falls back for unknown errors", () => {
    expect(formatAppError(new Error("boom"))).toEqual({
      code: "UNKNOWN",
      message: "boom",
      detail: null,
    });
  });
});

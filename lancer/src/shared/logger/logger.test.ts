import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { redactFields } from "@/shared/logger/redact";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

describe("redactFields", () => {
  it("redacts token keys", () => {
    expect(redactFields({ token: "abc", pod: "iam" })).toEqual({
      token: "[redacted]",
      pod: "iam",
    });
  });
});

describe("logger.error", () => {
  it("persists errors over IPC", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger } = await import("@/shared/logger");
    logger.error("failed to render pod details", { podName: "iam-1" });
    await vi.waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalled();
    });
    errorSpy.mockRestore();
  });
});

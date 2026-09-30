import { describe, expect, it } from "vitest";
import { createMockLogLines } from "@/shared/mocks/logs";

describe("createMockLogLines", () => {
  it("creates a bounded deterministic window", () => {
    const lines = createMockLogLines(100);
    expect(lines).toHaveLength(100);
    expect(lines[0]?.lineNumber).toBe(1);
    expect(lines[99]?.id).toBe("log-99");
  });
});

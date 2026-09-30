import { describe, expect, it } from "vitest";
import { createInMemoryLogsNativeApi } from "./logs-engine";

describe("createInMemoryLogsNativeApi", () => {
  it("opens a session and returns bounded windows only", async () => {
    const logs = createInMemoryLogsNativeApi({ defaultLineCount: 500 });
    const { sessionId } = await logs.open({
      provider: "kubernetes",
      namespace: "default",
      pod: "p1",
    });
    const session = await logs.getSession(sessionId);
    expect(session.totalLines).toBe(500);

    const window = await logs.readWindow({ sessionId, offset: 490, limit: 20 });
    expect(window.lines).toHaveLength(10);
    expect(window.lines[0]?.lineNumber).toBe(491);
    expect(window.totalLines).toBe(500);

    await logs.close(sessionId);
    await expect(logs.readWindow({ sessionId, offset: 0, limit: 10 })).rejects.toMatchObject({
      code: "LOG_FILE_NOT_FOUND",
    });
  });
});

import { describe, expect, it } from "vitest";
import { deriveConnectionStatus } from "@/features/shell/connection-status";

describe("deriveConnectionStatus", () => {
  it("is disconnected without a cluster", () => {
    expect(
      deriveConnectionStatus({
        clusterId: null,
        isFetching: false,
        isError: false,
        hasData: false,
      }),
    ).toBe("disconnected");
  });

  it("is syncing while a fetch is in flight", () => {
    expect(
      deriveConnectionStatus({
        clusterId: "c1",
        isFetching: true,
        isError: false,
        hasData: true,
      }),
    ).toBe("syncing");
  });

  it("is stale when refresh failed but previous data remains", () => {
    expect(
      deriveConnectionStatus({
        clusterId: "c1",
        isFetching: false,
        isError: true,
        hasData: true,
      }),
    ).toBe("stale");
  });

  it("is error when fetch failed with no data", () => {
    expect(
      deriveConnectionStatus({
        clusterId: "c1",
        isFetching: false,
        isError: true,
        hasData: false,
      }),
    ).toBe("error");
  });

  it("is connected after a successful read", () => {
    expect(
      deriveConnectionStatus({
        clusterId: "c1",
        isFetching: false,
        isError: false,
        hasData: true,
      }),
    ).toBe("connected");
  });
});

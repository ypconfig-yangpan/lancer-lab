import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyResourceWatchEvent } from "./apply-resource-watch-event";
import { podKeys } from "./query-keys";
import type { ResourceWatchEvent } from "@/entities/watch/types";

function podEvent(
  action: ResourceWatchEvent["action"],
  overrides: Partial<NonNullable<ResourceWatchEvent["pod"]>> = {},
): ResourceWatchEvent {
  return {
    clusterId: "c1",
    namespace: "sly-test",
    kind: "pod",
    action,
    pod: {
      uid: "uid-1",
      name: "app-1",
      namespace: "sly-test",
      phase: "Running",
      ready: "1/1",
      restarts: 0,
      nodeName: "n1",
      podIp: "10.0.0.1",
      image: "img:1",
      createdAt: "2026-09-30T00:00:00Z",
      labels: { app: "x" },
      containers: ["c"],
      ...overrides,
    },
  };
}

describe("applyResourceWatchEvent", () => {
  it("upserts and deletes pods in the list cache", () => {
    const qc = new QueryClient();
    const key = podKeys.list("c1", "sly-test");

    applyResourceWatchEvent(qc, podEvent("upsert"));
    expect(qc.getQueryData(key)).toHaveLength(1);

    applyResourceWatchEvent(
      qc,
      podEvent("upsert", { phase: "Terminating", ready: "1/1" }),
    );
    const rows = qc.getQueryData(key) as Array<{ phase: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.phase).toBe("Terminating");

    applyResourceWatchEvent(qc, podEvent("delete"));
    expect(qc.getQueryData(key)).toEqual([]);
  });

  it("replaces the list on resyncDone", () => {
    const qc = new QueryClient();
    const key = podKeys.list("c1", "sly-test");
    qc.setQueryData(key, [
      {
        uid: "old",
        name: "old",
        namespace: "sly-test",
        phase: "Running",
        ready: "1/1",
        restarts: 0,
        nodeName: "",
        podIp: "",
        image: "",
        ageSeconds: 0,
        createdAt: "",
        labels: {},
        containers: [],
      },
    ]);

    applyResourceWatchEvent(qc, {
      clusterId: "c1",
      namespace: "sly-test",
      kind: "pod",
      action: "resyncStart",
    });
    applyResourceWatchEvent(qc, podEvent("upsert", { uid: "uid-2", name: "new" }));
    applyResourceWatchEvent(qc, {
      clusterId: "c1",
      namespace: "sly-test",
      kind: "pod",
      action: "resyncDone",
    });

    const rows = qc.getQueryData(key) as Array<{ uid: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.uid).toBe("uid-2");
  });
});

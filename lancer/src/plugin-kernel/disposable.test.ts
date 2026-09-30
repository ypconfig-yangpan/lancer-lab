import { describe, expect, it } from "vitest";
import { DisposableStore, toDisposable } from "./disposable";

describe("DisposableStore", () => {
  it("disposes in reverse registration order", async () => {
    const order: string[] = [];
    const store = new DisposableStore();
    store.add(
      toDisposable(() => {
        order.push("a");
      }),
    );
    store.add(
      toDisposable(() => {
        order.push("b");
      }),
    );
    store.add(
      toDisposable(() => {
        order.push("c");
      }),
    );
    await store.dispose();
    expect(order).toEqual(["c", "b", "a"]);
  });

  it("dispose is idempotent", async () => {
    let count = 0;
    const store = new DisposableStore();
    store.add(
      toDisposable(() => {
        count += 1;
      }),
    );
    await store.dispose();
    await store.dispose();
    expect(count).toBe(1);
  });
});

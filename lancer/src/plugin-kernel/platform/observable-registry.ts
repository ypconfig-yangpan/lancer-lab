import { toDisposable } from "../disposable";
import type { Disposable } from "../types";

/** Base registry with snapshot + subscribe for React useSyncExternalStore. */
export abstract class ObservableRegistry {
  private readonly listeners = new Set<() => void>();
  private version = 0;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getVersion(): number {
    return this.version;
  }

  protected notify(): void {
    this.version += 1;
    for (const listener of [...this.listeners]) {
      listener();
    }
  }

  protected trackUnregister(unregister: () => void): Disposable {
    return toDisposable(() => {
      unregister();
      this.notify();
    });
  }
}

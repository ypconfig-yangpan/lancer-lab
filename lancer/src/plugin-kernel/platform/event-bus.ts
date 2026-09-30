import { toDisposable } from "../disposable";
import type { Disposable } from "../types";

type Listener<T> = (payload: T) => void;

/** Simple typed pub/sub. Plugin-scoped wrappers restrict emit/subscribe ownership. */
export class EventBus {
  private readonly listeners = new Map<string, Set<Listener<unknown>>>();

  on<T = unknown>(event: string, listener: Listener<T>): Disposable {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const typed = listener as Listener<unknown>;
    set.add(typed);
    return toDisposable(() => {
      set?.delete(typed);
      if (set && set.size === 0) {
        this.listeners.delete(event);
      }
    });
  }

  emit<T = unknown>(event: string, payload: T): void {
    const set = this.listeners.get(event);
    if (!set) {
      return;
    }
    for (const listener of [...set]) {
      listener(payload);
    }
  }

  listenerCount(event?: string): number {
    if (event) {
      return this.listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  clearModule(): void {
    // Ownership is via DisposableStore; this is a safety net for host events only.
  }
}

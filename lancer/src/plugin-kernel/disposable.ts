import type { Disposable } from "./types";

export class DisposableStore implements Disposable {
  private readonly items = new Set<Disposable>();
  private disposed = false;

  add<T extends Disposable>(value: T): T {
    if (this.disposed) {
      void Promise.resolve(value.dispose()).catch(() => {
        /* already tearing down */
      });
      return value;
    }
    this.items.add(value);
    return value;
  }

  delete(value: Disposable): void {
    this.items.delete(value);
  }

  async clear(): Promise<void> {
    const snapshot = [...this.items].reverse();
    this.items.clear();
    for (const item of snapshot) {
      await item.dispose();
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    await this.clear();
  }

  get size(): number {
    return this.items.size;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }
}

export function toDisposable(fn: () => void | Promise<void>): Disposable {
  let disposed = false;
  return {
    dispose: async () => {
      if (disposed) {
        return;
      }
      disposed = true;
      await fn();
    },
  };
}

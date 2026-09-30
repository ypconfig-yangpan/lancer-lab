import { toDisposable } from "../disposable";
import type { Disposable, OperationCreateOptions, PluginOperation } from "../types";
import { ObservableRegistry } from "./observable-registry";

interface InternalOperation extends PluginOperation {
  cancelled: boolean;
}

export class OperationManager extends ObservableRegistry {
  private readonly operations = new Map<string, InternalOperation>();
  private seq = 0;

  create(moduleId: string, options: OperationCreateOptions): PluginOperation {
    const id = `${moduleId}:op:${++this.seq}`;
    const operation: InternalOperation = {
      id,
      moduleId,
      type: options.type,
      title: options.title,
      cancelled: false,
      cancel: async () => {
        if (operation.cancelled) {
          return;
        }
        operation.cancelled = true;
        this.operations.delete(id);
        this.notify();
      },
    };
    this.operations.set(id, operation);
    this.notify();
    return operation;
  }

  track(
    moduleId: string,
    options: OperationCreateOptions,
    storeAdd: (d: Disposable) => void,
  ): PluginOperation {
    const operation = this.create(moduleId, options);
    storeAdd(
      toDisposable(async () => {
        await operation.cancel();
      }),
    );
    return operation;
  }

  listByModule(moduleId: string): PluginOperation[] {
    return [...this.operations.values()].filter(
      (o) => o.moduleId === moduleId && !o.cancelled,
    );
  }

  async cancelAll(moduleId: string): Promise<void> {
    const owned = this.listByModule(moduleId);
    await Promise.all(owned.map((o) => o.cancel()));
  }

  size(): number {
    return this.operations.size;
  }
}

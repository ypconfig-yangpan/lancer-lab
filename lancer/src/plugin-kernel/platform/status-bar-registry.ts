import type { Disposable, StatusBarItemDescriptor } from "../types";
import { ObservableRegistry } from "./observable-registry";

export class StatusBarRegistry extends ObservableRegistry {
  private readonly byId = new Map<string, StatusBarItemDescriptor>();

  register(descriptor: StatusBarItemDescriptor): Disposable {
    if (this.byId.has(descriptor.id)) {
      throw new Error(`Status bar item already registered: ${descriptor.id}`);
    }
    this.byId.set(descriptor.id, descriptor);
    this.notify();
    return this.trackUnregister(() => {
      this.byId.delete(descriptor.id);
    });
  }

  list(): StatusBarItemDescriptor[] {
    return [...this.byId.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  listByModule(moduleId: string): StatusBarItemDescriptor[] {
    return this.list().filter((s) => s.moduleId === moduleId);
  }

  unregisterByModule(moduleId: string): void {
    for (const [id, item] of [...this.byId.entries()]) {
      if (item.moduleId === moduleId) {
        this.byId.delete(id);
      }
    }
    this.notify();
  }

  size(): number {
    return this.byId.size;
  }
}

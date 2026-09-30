import type { Disposable, ViewDescriptor } from "../types";
import { ObservableRegistry } from "./observable-registry";

export class ViewRegistry extends ObservableRegistry {
  private readonly byId = new Map<string, ViewDescriptor>();

  register(descriptor: ViewDescriptor): Disposable {
    if (this.byId.has(descriptor.id)) {
      throw new Error(`View already registered: ${descriptor.id}`);
    }
    this.byId.set(descriptor.id, descriptor);
    this.notify();
    return this.trackUnregister(() => {
      this.byId.delete(descriptor.id);
    });
  }

  resolve(viewId: string): ViewDescriptor | undefined {
    return this.byId.get(viewId);
  }

  list(): ViewDescriptor[] {
    return [...this.byId.values()];
  }

  listByLocation(location: ViewDescriptor["location"]): ViewDescriptor[] {
    return this.list().filter((v) => v.location === location);
  }

  listByModule(moduleId: string): ViewDescriptor[] {
    return this.list().filter((v) => v.moduleId === moduleId);
  }

  unregisterByModule(moduleId: string): void {
    for (const [id, view] of [...this.byId.entries()]) {
      if (view.moduleId === moduleId) {
        this.byId.delete(id);
      }
    }
    this.notify();
  }

  size(): number {
    return this.byId.size;
  }
}

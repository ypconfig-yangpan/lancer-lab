import type { Disposable, InspectorSectionDescriptor } from "../types";
import { ObservableRegistry } from "./observable-registry";

export class InspectorRegistry extends ObservableRegistry {
  private readonly byId = new Map<string, InspectorSectionDescriptor>();

  register(descriptor: InspectorSectionDescriptor): Disposable {
    if (this.byId.has(descriptor.id)) {
      throw new Error(`Inspector section already registered: ${descriptor.id}`);
    }
    this.byId.set(descriptor.id, descriptor);
    this.notify();
    return this.trackUnregister(() => {
      this.byId.delete(descriptor.id);
    });
  }

  list(): InspectorSectionDescriptor[] {
    return [...this.byId.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  listByModule(moduleId: string): InspectorSectionDescriptor[] {
    return this.list().filter((s) => s.moduleId === moduleId);
  }

  unregisterByModule(moduleId: string): void {
    for (const [id, section] of [...this.byId.entries()]) {
      if (section.moduleId === moduleId) {
        this.byId.delete(id);
      }
    }
    this.notify();
  }

  size(): number {
    return this.byId.size;
  }
}

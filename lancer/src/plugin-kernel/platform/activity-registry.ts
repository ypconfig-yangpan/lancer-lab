import type { ActivityDescriptor, Disposable } from "../types";
import { ObservableRegistry } from "./observable-registry";

export class ActivityRegistry extends ObservableRegistry {
  private readonly byId = new Map<string, ActivityDescriptor>();

  register(descriptor: ActivityDescriptor): Disposable {
    if (this.byId.has(descriptor.id)) {
      throw new Error(`Activity already registered: ${descriptor.id}`);
    }
    this.byId.set(descriptor.id, descriptor);
    this.notify();
    return this.trackUnregister(() => {
      this.byId.delete(descriptor.id);
    });
  }

  resolve(activityId: string): ActivityDescriptor | undefined {
    return this.byId.get(activityId);
  }

  list(): ActivityDescriptor[] {
    return [...this.byId.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  listByModule(moduleId: string): ActivityDescriptor[] {
    return this.list().filter((a) => a.moduleId === moduleId);
  }

  unregisterByModule(moduleId: string): void {
    for (const [id, activity] of [...this.byId.entries()]) {
      if (activity.moduleId === moduleId) {
        this.byId.delete(id);
      }
    }
    this.notify();
  }

  size(): number {
    return this.byId.size;
  }
}

import type { Disposable, SlotDescriptor } from "../types";
import { ObservableRegistry } from "./observable-registry";

export class SlotRegistry extends ObservableRegistry {
  private readonly byId = new Map<string, SlotDescriptor>();

  register(descriptor: SlotDescriptor): Disposable {
    const key = `${descriptor.slotId}::${descriptor.id}`;
    if (this.byId.has(key)) {
      throw new Error(`Slot contribution already registered: ${key}`);
    }
    this.byId.set(key, descriptor);
    this.notify();
    return this.trackUnregister(() => {
      this.byId.delete(key);
    });
  }

  listForSlot(slotId: string): SlotDescriptor[] {
    return [...this.byId.values()]
      .filter((s) => s.slotId === slotId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  listByModule(moduleId: string): SlotDescriptor[] {
    return [...this.byId.values()].filter((s) => s.moduleId === moduleId);
  }

  unregisterByModule(moduleId: string): void {
    for (const [key, slot] of [...this.byId.entries()]) {
      if (slot.moduleId === moduleId) {
        this.byId.delete(key);
      }
    }
    this.notify();
  }

  size(): number {
    return this.byId.size;
  }
}

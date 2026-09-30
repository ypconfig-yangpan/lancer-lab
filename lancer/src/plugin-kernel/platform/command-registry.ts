import type { CommandDescriptor, Disposable } from "../types";
import { ObservableRegistry } from "./observable-registry";

export class CommandRegistry extends ObservableRegistry {
  private readonly byId = new Map<string, CommandDescriptor>();

  register(descriptor: CommandDescriptor): Disposable {
    if (this.byId.has(descriptor.id)) {
      throw new Error(`Command already registered: ${descriptor.id}`);
    }
    this.byId.set(descriptor.id, descriptor);
    this.notify();
    return this.trackUnregister(() => {
      this.byId.delete(descriptor.id);
    });
  }

  resolve(commandId: string): CommandDescriptor | undefined {
    return this.byId.get(commandId);
  }

  list(): CommandDescriptor[] {
    return [...this.byId.values()];
  }

  listByModule(moduleId: string): CommandDescriptor[] {
    return this.list().filter((c) => c.moduleId === moduleId);
  }

  unregisterByModule(moduleId: string): void {
    for (const [id, cmd] of [...this.byId.entries()]) {
      if (cmd.moduleId === moduleId) {
        this.byId.delete(id);
      }
    }
    this.notify();
  }

  size(): number {
    return this.byId.size;
  }
}

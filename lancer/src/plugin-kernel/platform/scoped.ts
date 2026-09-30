import type { QueryClient } from "@tanstack/react-query";
import type { DisposableStore } from "../disposable";
import type {
  ActivityDescriptor,
  CommandDescriptor,
  Disposable,
  InspectorSectionDescriptor,
  OperationCreateOptions,
  PluginOperation,
  PluginSession,
  SessionCreateOptions,
  SlotDescriptor,
  StatusBarItemDescriptor,
  ViewDescriptor,
} from "../types";
import type { ActivityRegistry } from "./activity-registry";
import type { CommandRegistry } from "./command-registry";
import type { EventBus } from "./event-bus";
import type { InspectorRegistry } from "./inspector-registry";
import type { OperationManager } from "./operation-manager";
import type { SessionManager } from "./session-manager";
import type { SlotRegistry } from "./slot-registry";
import type { StatusBarRegistry } from "./status-bar-registry";
import type { ViewRegistry } from "./view-registry";

function track(store: DisposableStore, disposable: Disposable): Disposable {
  return store.add(disposable);
}

function withModuleId<T extends object>(
  moduleId: string,
  descriptor: T,
): T & { moduleId: string } {
  return { ...descriptor, moduleId };
}

export class ScopedCommandRegistry {
  constructor(
    private readonly moduleId: string,
    private readonly registry: CommandRegistry,
    private readonly disposables: DisposableStore,
  ) {}

  register(descriptor: Omit<CommandDescriptor, "moduleId">): Disposable {
    return track(
      this.disposables,
      this.registry.register(withModuleId(this.moduleId, descriptor)),
    );
  }
}

export class ScopedViewRegistry {
  constructor(
    private readonly moduleId: string,
    private readonly registry: ViewRegistry,
    private readonly disposables: DisposableStore,
  ) {}

  register(descriptor: Omit<ViewDescriptor, "moduleId">): Disposable {
    return track(
      this.disposables,
      this.registry.register(withModuleId(this.moduleId, descriptor)),
    );
  }

  resolve(viewId: string): ViewDescriptor | undefined {
    return this.registry.resolve(viewId);
  }
}

export class ScopedSlotRegistry {
  constructor(
    private readonly moduleId: string,
    private readonly registry: SlotRegistry,
    private readonly disposables: DisposableStore,
  ) {}

  register(descriptor: Omit<SlotDescriptor, "moduleId">): Disposable {
    return track(
      this.disposables,
      this.registry.register(withModuleId(this.moduleId, descriptor)),
    );
  }
}

export class ScopedActivityRegistry {
  constructor(
    private readonly moduleId: string,
    private readonly registry: ActivityRegistry,
    private readonly disposables: DisposableStore,
  ) {}

  register(descriptor: Omit<ActivityDescriptor, "moduleId">): Disposable {
    return track(
      this.disposables,
      this.registry.register(withModuleId(this.moduleId, descriptor)),
    );
  }
}

export class ScopedInspectorRegistry {
  constructor(
    private readonly moduleId: string,
    private readonly registry: InspectorRegistry,
    private readonly disposables: DisposableStore,
  ) {}

  register(descriptor: Omit<InspectorSectionDescriptor, "moduleId">): Disposable {
    return track(
      this.disposables,
      this.registry.register(withModuleId(this.moduleId, descriptor)),
    );
  }
}

export class ScopedStatusBarRegistry {
  constructor(
    private readonly moduleId: string,
    private readonly registry: StatusBarRegistry,
    private readonly disposables: DisposableStore,
  ) {}

  register(descriptor: Omit<StatusBarItemDescriptor, "moduleId">): Disposable {
    return track(
      this.disposables,
      this.registry.register(withModuleId(this.moduleId, descriptor)),
    );
  }
}

export class ScopedSessionManager {
  constructor(
    private readonly moduleId: string,
    private readonly manager: SessionManager,
    private readonly disposables: DisposableStore,
  ) {}

  create(options: SessionCreateOptions): PluginSession {
    return this.manager.track(this.moduleId, options, (d) => this.disposables.add(d));
  }
}

export class ScopedOperationManager {
  constructor(
    private readonly moduleId: string,
    private readonly manager: OperationManager,
    private readonly disposables: DisposableStore,
  ) {}

  create(options: OperationCreateOptions): PluginOperation {
    return this.manager.track(this.moduleId, options, (d) => this.disposables.add(d));
  }
}

export class ScopedCredentialAccess {
  constructor(private readonly moduleId: string) {}

  async getSecret(key: string): Promise<string | null> {
    void this.moduleId;
    void key;
    return null;
  }
}

export class ScopedEventBus {
  constructor(
    private readonly moduleId: string,
    private readonly bus: EventBus,
    private readonly disposables: DisposableStore,
  ) {}

  on<T = unknown>(event: string, listener: (payload: T) => void): Disposable {
    const namespaced = `module:${this.moduleId}:${event}`;
    return track(this.disposables, this.bus.on(namespaced, listener));
  }

  emit<T = unknown>(event: string, payload: T): void {
    this.bus.emit(`module:${this.moduleId}:${event}`, payload);
  }
}

export class ScopedPluginStorage {
  private memory = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.memory.get(key) as T | undefined;
  }

  set(key: string, value: unknown): void {
    this.memory.set(key, value);
  }

  delete(key: string): void {
    this.memory.delete(key);
  }

  clear(): void {
    this.memory.clear();
  }
}

export class ScopedQueryAccess {
  constructor(
    private readonly moduleId: string,
    private readonly queryClient: QueryClient | null,
  ) {}

  key(parts: readonly unknown[]): unknown[] {
    return [this.moduleId, ...parts];
  }

  getClient(): QueryClient | null {
    return this.queryClient;
  }

  setData<T>(parts: readonly unknown[], data: T): void {
    this.queryClient?.setQueryData(this.key(parts), data);
  }

  getData<T>(parts: readonly unknown[]): T | undefined {
    return this.queryClient?.getQueryData<T>(this.key(parts));
  }

  async cancelAndRemove(): Promise<void> {
    if (!this.queryClient) {
      return;
    }
    const queryKey = [this.moduleId];
    await this.queryClient.cancelQueries({ queryKey });
    this.queryClient.removeQueries({ queryKey });
  }
}

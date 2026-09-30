import { toDisposable } from "../disposable";
import type { Disposable, PluginSession, SessionCreateOptions } from "../types";
import { ObservableRegistry } from "./observable-registry";

interface InternalSession extends PluginSession {
  closed: boolean;
}

export class SessionManager extends ObservableRegistry {
  private readonly sessions = new Map<string, InternalSession>();
  private seq = 0;

  create(moduleId: string, options: SessionCreateOptions): PluginSession {
    const id = `${moduleId}:session:${++this.seq}`;
    const session: InternalSession = {
      id,
      moduleId,
      type: options.type,
      metadata: options.metadata ?? {},
      closed: false,
      close: async () => {
        if (session.closed) {
          return;
        }
        session.closed = true;
        this.sessions.delete(id);
        this.notify();
      },
    };
    this.sessions.set(id, session);
    this.notify();
    return session;
  }

  track(
    moduleId: string,
    options: SessionCreateOptions,
    storeAdd: (d: Disposable) => void,
  ): PluginSession {
    const session = this.create(moduleId, options);
    storeAdd(
      toDisposable(async () => {
        await session.close();
      }),
    );
    return session;
  }

  listByModule(moduleId: string): PluginSession[] {
    return [...this.sessions.values()].filter((s) => s.moduleId === moduleId && !s.closed);
  }

  async closeAll(moduleId: string): Promise<void> {
    const owned = this.listByModule(moduleId);
    await Promise.all(owned.map((s) => s.close()));
  }

  size(): number {
    return this.sessions.size;
  }
}

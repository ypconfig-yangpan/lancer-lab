import { DisposableStore } from "./disposable";

/** Per-module resource scope. Host owns final cleanup on deactivate. */
export class PluginScope {
  readonly moduleId: string;
  readonly abortController = new AbortController();
  readonly disposables = new DisposableStore();
  private disposed = false;

  constructor(moduleId: string) {
    this.moduleId = moduleId;
  }

  get abortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.abortController.abort();
    await this.disposables.dispose();
  }
}

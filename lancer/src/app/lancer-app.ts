import {
  APP_LIFECYCLE_TIMEOUTS,
  type AppLifecycleTimeoutKey,
} from "@/app/lifecycle/config";
import { logger } from "@/shared/logger";

type LifecycleTimeouts = Record<AppLifecycleTimeoutKey, number>;

export type AppPhase =
  | "created"
  | "bootstrapping"
  | "ready"
  | "running"
  | "shuttingDown"
  | "stopped";

/** Canonical shutdown reasons — see docs/APPLICATION_LIFECYCLE.md */
export type ShutdownReason = "user-close" | "restart" | "update" | "system" | "fatal" | "error";

export interface ShutdownOutcome {
  cancelled: boolean;
  /** Human-readable veto reason when cancelled (e.g. live log stream). */
  reason?: string;
}

export interface BeforeShutdownContext {
  reason: ShutdownReason;
}

export type ShutdownDecision = { allow: true } | { allow: false; reason: string };

export type BeforeShutdownHook = (
  context: BeforeShutdownContext,
) => ShutdownDecision | void | Promise<ShutdownDecision | void>;

/**
 * A lifecycle-managed piece of the application.
 *
 * LancerApp is a conductor, not a service locator: subsystems keep their own
 * state and expose their own handles; the app owns ordering only. Plugins never
 * see LancerApp — their whole world is PluginContext.
 */
export interface AppSubsystem {
  readonly id: string;
  start?(): Promise<void>;
  stop(reason?: ShutdownReason): Promise<void>;
}

type PhaseListener = (phase: AppPhase) => void;

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

/**
 * Host of the application lifecycle: start subsystems in dependency order,
 * stop them in exact reverse, and own the shutdown decision point
 * (before-shutdown hooks may veto, e.g. live log stream confirmation).
 */
export class LancerApp {
  private phase: AppPhase = "created";
  private readonly subsystems: AppSubsystem[] = [];
  /** Only subsystems that completed start() are stopped, in reverse order. */
  private started: AppSubsystem[] = [];
  private readonly phaseListeners = new Set<PhaseListener>();
  private readonly beforeShutdownHooks = new Set<BeforeShutdownHook>();
  private shutdownPromise: Promise<ShutdownOutcome> | null = null;
  private readonly timeouts: LifecycleTimeouts;

  constructor(timeouts: LifecycleTimeouts = APP_LIFECYCLE_TIMEOUTS) {
    this.timeouts = timeouts;
  }

  use(subsystem: AppSubsystem): this {
    if (this.phase !== "created") {
      throw new Error(`Cannot register subsystem ${subsystem.id} after start`);
    }
    this.subsystems.push(subsystem);
    return this;
  }

  get currentPhase(): AppPhase {
    return this.phase;
  }

  get isShuttingDown(): boolean {
    return this.phase === "shuttingDown";
  }

  onPhase(listener: PhaseListener): () => void {
    this.phaseListeners.add(listener);
    return () => {
      this.phaseListeners.delete(listener);
    };
  }

  onBeforeShutdown(hook: BeforeShutdownHook): () => void {
    this.beforeShutdownHooks.add(hook);
    return () => {
      this.beforeShutdownHooks.delete(hook);
    };
  }

  async start(): Promise<void> {
    if (this.phase !== "created") {
      throw new Error(`LancerApp already started (phase: ${this.phase})`);
    }
    this.setPhase("bootstrapping");
    for (const subsystem of this.subsystems) {
      const startedAt = performance.now();
      try {
        if (subsystem.start) {
          await withTimeout(
            Promise.resolve(subsystem.start()),
            this.timeouts.subsystemStart,
            `lifecycle.start subsystem=${subsystem.id}`,
          );
        }
        this.started.push(subsystem);
        logger.operation("lifecycle.start", {
          subsystem: subsystem.id,
          durationMs: Math.round(performance.now() - startedAt),
          result: "success",
        });
      } catch (error) {
        logger.error("lifecycle.start", {
          subsystem: subsystem.id,
          durationMs: Math.round(performance.now() - startedAt),
          result: "error",
          error: String(error),
        });
        await this.stopStarted("error");
        this.setPhase("stopped");
        throw error;
      }
    }
    this.setPhase("ready");
  }

  /** The view layer calls this after mount; everything else is identical at "ready". */
  markRunning(): void {
    if (this.phase === "ready") {
      this.setPhase("running");
    }
  }

  async shutdown(reason: ShutdownReason): Promise<ShutdownOutcome> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }
    if (this.phase === "created" || this.phase === "stopped") {
      return { cancelled: false };
    }
    this.shutdownPromise = this.runShutdown(reason);
    return this.shutdownPromise;
  }

  private async runShutdown(reason: ShutdownReason): Promise<ShutdownOutcome> {
    const resumePhase = this.phase === "ready" ? "ready" : "running";
    this.setPhase("shuttingDown");

    for (const hook of [...this.beforeShutdownHooks]) {
      let decision: ShutdownDecision | undefined;
      try {
        const result = await withTimeout(
          Promise.resolve(hook({ reason })),
          this.timeouts.beforeShutdownHook,
          "lifecycle.beforeShutdown",
        );
        decision = result === undefined ? undefined : result;
      } catch (error) {
        logger.error("before-shutdown hook failed", { error: String(error) });
        continue;
      }
      if (decision && decision.allow === false) {
        this.shutdownPromise = null;
        this.setPhase(resumePhase);
        return { cancelled: true, reason: decision.reason };
      }
    }

    await this.stopStarted(reason);
    this.setPhase("stopped");
    logger.operation("app stopped", { reason });
    return { cancelled: false };
  }

  private async stopStarted(reason: ShutdownReason): Promise<void> {
    for (const subsystem of [...this.started].reverse()) {
      const startedAt = performance.now();
      try {
        await withTimeout(
          Promise.resolve(subsystem.stop(reason)),
          this.timeouts.subsystemStop,
          `lifecycle.stop subsystem=${subsystem.id}`,
        );
        logger.operation("lifecycle.stop", {
          subsystem: subsystem.id,
          durationMs: Math.round(performance.now() - startedAt),
          result: "success",
          reason,
        });
      } catch (error) {
        // One failing / timed-out subsystem must never block the rest of teardown.
        logger.error("lifecycle.stop", {
          subsystem: subsystem.id,
          durationMs: Math.round(performance.now() - startedAt),
          result: "error",
          reason,
          error: String(error),
        });
      }
    }
    this.started = [];
  }

  private setPhase(phase: AppPhase): void {
    if (this.phase === phase) {
      return;
    }
    this.phase = phase;
    for (const listener of [...this.phaseListeners]) {
      listener(phase);
    }
  }
}

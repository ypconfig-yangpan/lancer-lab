import { describe, expect, it } from "vitest";
import { type AppSubsystem, LancerApp } from "@/app/lancer-app";

function trackingSubsystem(id: string, log: string[]): AppSubsystem {
  return {
    id,
    async start() {
      log.push(`${id}:start`);
    },
    async stop() {
      log.push(`${id}:stop`);
    },
  };
}

describe("LancerApp", () => {
  it("starts subsystems in registration order and stops in reverse", async () => {
    const log: string[] = [];
    const app = new LancerApp()
      .use(trackingSubsystem("a", log))
      .use(trackingSubsystem("b", log))
      .use(trackingSubsystem("c", log));

    await app.start();
    expect(app.currentPhase).toBe("ready");
    expect(log).toEqual(["a:start", "b:start", "c:start"]);

    app.markRunning();
    expect(app.currentPhase).toBe("running");

    const outcome = await app.shutdown("system");
    expect(outcome.cancelled).toBe(false);
    expect(app.currentPhase).toBe("stopped");
    expect(log).toEqual(["a:start", "b:start", "c:start", "c:stop", "b:stop", "a:stop"]);
  });

  it("rolls back started subsystems when a later start fails", async () => {
    const log: string[] = [];
    const app = new LancerApp()
      .use(trackingSubsystem("a", log))
      .use({
        id: "boom",
        async start() {
          log.push("boom:start");
          throw new Error("fail");
        },
        async stop() {
          log.push("boom:stop");
        },
      })
      .use(trackingSubsystem("c", log));

    await expect(app.start()).rejects.toThrow("fail");
    expect(app.currentPhase).toBe("stopped");
    expect(log).toEqual(["a:start", "boom:start", "a:stop"]);
  });

  it("beforeShutdown hook can veto", async () => {
    const log: string[] = [];
    const app = new LancerApp().use(trackingSubsystem("a", log));
    await app.start();
    app.markRunning();

    const dispose = app.onBeforeShutdown(() => ({
      allow: false,
      reason: "live stream",
    }));

    const vetoed = await app.shutdown("user-close");
    expect(vetoed).toEqual({ cancelled: true, reason: "live stream" });
    expect(app.currentPhase).toBe("running");
    expect(log).toEqual(["a:start"]);

    dispose();
    const done = await app.shutdown("user-close");
    expect(done.cancelled).toBe(false);
    expect(log).toEqual(["a:start", "a:stop"]);
  });

  it("dedupes concurrent shutdown calls", async () => {
    let stops = 0;
    const app = new LancerApp().use({
      id: "slow",
      async start() {},
      async stop() {
        stops += 1;
        await new Promise((r) => setTimeout(r, 20));
      },
    });
    await app.start();
    app.markRunning();

    const [a, b] = await Promise.all([app.shutdown("system"), app.shutdown("system")]);
    expect(a.cancelled).toBe(false);
    expect(b.cancelled).toBe(false);
    expect(stops).toBe(1);
  });

  it("does not allow subsystem registration after start", async () => {
    const app = new LancerApp().use(trackingSubsystem("a", []));
    await app.start();
    expect(() => app.use(trackingSubsystem("late", []))).toThrow(/after start/);
    await app.shutdown("system");
  });

  it("times out a hanging start and rolls back", async () => {
    const log: string[] = [];
    const app = new LancerApp({
      subsystemStart: 30,
      subsystemStop: 30,
      beforeShutdownHook: 30,
    })
      .use(trackingSubsystem("a", log))
      .use({
        id: "hang",
        async start() {
          log.push("hang:start");
          await new Promise(() => undefined);
        },
        async stop() {
          log.push("hang:stop");
        },
      });

    await expect(app.start()).rejects.toThrow(/timed out/);
    expect(app.currentPhase).toBe("stopped");
    expect(log).toEqual(["a:start", "hang:start", "a:stop"]);
  });

  it("continues stop after a timed-out subsystem", async () => {
    const log: string[] = [];
    const app = new LancerApp({
      subsystemStart: 5_000,
      subsystemStop: 30,
      beforeShutdownHook: 30,
    })
      .use(trackingSubsystem("a", log))
      .use({
        id: "hang-stop",
        async start() {
          log.push("hang-stop:start");
        },
        async stop() {
          log.push("hang-stop:stop-begin");
          await new Promise(() => undefined);
        },
      });

    await app.start();
    const outcome = await app.shutdown("system");
    expect(outcome.cancelled).toBe(false);
    expect(log).toEqual(["a:start", "hang-stop:start", "hang-stop:stop-begin", "a:stop"]);
  });
});

describe("createDesktopApp composition", () => {
  it("bootstraps kernel activities and exposes ShellFacade", async () => {
    const { createDesktopApp } = await import("@/app/create-desktop-app");
    const desktop = createDesktopApp();
    await desktop.app.start();

    expect(desktop.app.currentPhase).toBe("ready");
    expect(desktop.shellFacade.platform.activities.size()).toBeGreaterThan(0);

    const outcome = await desktop.app.shutdown("system");
    expect(outcome.cancelled).toBe(false);
    expect(desktop.app.currentPhase).toBe("stopped");
  });
});

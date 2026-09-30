import type { QueryClient } from "@tanstack/react-query";
import { ActivityRegistry } from "./activity-registry";
import { CommandRegistry } from "./command-registry";
import { EventBus } from "./event-bus";
import { InspectorRegistry } from "./inspector-registry";
import { OperationManager } from "./operation-manager";
import { SessionManager } from "./session-manager";
import { SlotRegistry } from "./slot-registry";
import { StatusBarRegistry } from "./status-bar-registry";
import { ViewRegistry } from "./view-registry";

/** Core-owned platform registries for Shell modules. */
export class PlatformServices {
  readonly commands = new CommandRegistry();
  readonly views = new ViewRegistry();
  readonly slots = new SlotRegistry();
  readonly activities = new ActivityRegistry();
  readonly inspector = new InspectorRegistry();
  readonly statusBar = new StatusBarRegistry();
  readonly sessions = new SessionManager();
  readonly operations = new OperationManager();
  readonly events = new EventBus();
  queryClient: QueryClient | null = null;

  setQueryClient(client: QueryClient): void {
    this.queryClient = client;
  }

  contributionCounts(): {
    commands: number;
    views: number;
    slots: number;
    activities: number;
    inspector: number;
    statusBar: number;
    sessions: number;
    operations: number;
    eventListeners: number;
  } {
    return {
      commands: this.commands.size(),
      views: this.views.size(),
      slots: this.slots.size(),
      activities: this.activities.size(),
      inspector: this.inspector.size(),
      statusBar: this.statusBar.size(),
      sessions: this.sessions.size(),
      operations: this.operations.size(),
      eventListeners: this.events.listenerCount(),
    };
  }
}

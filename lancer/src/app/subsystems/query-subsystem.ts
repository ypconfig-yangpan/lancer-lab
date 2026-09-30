import { QueryClient } from "@tanstack/react-query";
import type { AppSubsystem } from "@/app/lancer-app";

/**
 * TanStack Query as an app subsystem. Constructed ready — it is registered
 * for shutdown ordering: the kernel cancels plugin-scoped queries first,
 * this sweep cancels and clears whatever remains.
 */
export class QuerySubsystem implements AppSubsystem {
  readonly id = "query";
  readonly client: QueryClient;

  constructor(client: QueryClient = QuerySubsystem.createDefaultClient()) {
    this.client = client;
  }

  async stop(): Promise<void> {
    await this.client.cancelQueries();
    this.client.clear();
  }

  private static createDefaultClient(): QueryClient {
    return new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
}

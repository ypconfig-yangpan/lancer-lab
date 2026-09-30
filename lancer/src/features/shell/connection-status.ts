export type ConnectionStatus = "disconnected" | "syncing" | "connected" | "stale" | "error";

export function deriveConnectionStatus(input: {
  clusterId: string | null;
  isFetching: boolean;
  isError: boolean;
  hasData: boolean;
}): ConnectionStatus {
  if (input.clusterId === null) {
    return "disconnected";
  }
  if (input.isFetching) {
    return "syncing";
  }
  if (input.isError && input.hasData) {
    return "stale";
  }
  if (input.isError) {
    return "error";
  }
  return "connected";
}

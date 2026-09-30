import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@lancer/ui";
import { isNativeCapabilityError } from "@/native/errors";
import { dockerApi } from "../api/client";
import { useDockerWorkspaceStore } from "../docker-workspace-store";

/**
 * Ping Docker Engine and mirror status into the workspace store + status bar.
 */
export function DockerEngineStatusBar() {
  const engineStatus = useDockerWorkspaceStore((s) => s.engineStatus);
  const apiVersion = useDockerWorkspaceStore((s) => s.apiVersion);
  const setEngineStatus = useDockerWorkspaceStore((s) => s.setEngineStatus);

  useQuery({
    queryKey: ["docker", "engine", "ping"],
    queryFn: async () => {
      setEngineStatus("checking");
      try {
        const result = await dockerApi.ping();
        setEngineStatus("online", {
          apiVersion: result.apiVersion ?? null,
          lastError: null,
        });
        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const offline =
          isNativeCapabilityError(error) &&
          (error.code === "DOCKER_UNAVAILABLE" ||
            error.code === "NATIVE_UNAVAILABLE" ||
            error.code === "NATIVE_BRIDGE_FAILED");
        setEngineStatus(offline ? "offline" : "offline", {
          apiVersion: null,
          lastError: message,
        });
        throw error;
      }
    },
    refetchInterval: 15_000,
    retry: false,
  });

  if (engineStatus === "checking" || engineStatus === "unknown") {
    return <StatusBadge tone="neutral" label="Docker…" />;
  }
  if (engineStatus === "online") {
    return (
      <StatusBadge
        tone="success"
        label={apiVersion ? `Docker · ${apiVersion}` : "Docker · online"}
      />
    );
  }
  return <StatusBadge tone="warning" label="Docker · offline" />;
}

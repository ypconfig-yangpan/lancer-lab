import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@lancer/ui";
import { useModuleSelectionStore } from "@/shell/presentation";
import { cn } from "@/shared/lib/utils";
import { useTabsStore } from "@/shared/stores/tabs-store";
import { dockerApi } from "../api/client";
import {
  type DockerContainerGroup,
  useDockerWorkspaceStore,
} from "../docker-workspace-store";
import { listContainersWithFallback, shouldFallbackToMock } from "../helpers/fallback";

const MODULE_ID = "docker";

const CONTAINER_GROUPS: { id: DockerContainerGroup; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "exited", label: "Exited" },
];

/**
 * Explorer: Engine chrome + expandable Containers tree (counts from live list).
 */
export function DockerExplorerView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setTreeSelection = useModuleSelectionStore((s) => s.setTreeSelection);
  const openWorkspaceTab = useTabsStore((s) => s.openWorkspaceTab);
  const engineStatus = useDockerWorkspaceStore((s) => s.engineStatus);
  const apiVersion = useDockerWorkspaceStore((s) => s.apiVersion);
  const lastError = useDockerWorkspaceStore((s) => s.lastError);
  const containerGroup = useDockerWorkspaceStore((s) => s.containerGroup);
  const explorerSection = useDockerWorkspaceStore((s) => s.explorerSection);
  const setContainerGroup = useDockerWorkspaceStore((s) => s.setContainerGroup);
  const setExplorerSection = useDockerWorkspaceStore((s) => s.setExplorerSection);
  const setEngineStatus = useDockerWorkspaceStore((s) => s.setEngineStatus);
  const [containersOpen, setContainersOpen] = useState(true);

  const pingQuery = useQuery({
    queryKey: ["docker", "engine", "ping", "explorer"],
    queryFn: async () => {
      setEngineStatus("checking");
      try {
        const result = await dockerApi.ping();
        setEngineStatus("online", { apiVersion: result.apiVersion ?? null, lastError: null });
        return result;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setEngineStatus("offline", {
          apiVersion: null,
          lastError: shouldFallbackToMock(error) ? message : message,
        });
        return null;
      }
    },
    refetchInterval: 15_000,
    retry: false,
  });

  const online = engineStatus === "online";

  const listQuery = useQuery({
    queryKey: ["docker", "containers", "explorer"],
    queryFn: () => listContainersWithFallback({}),
    enabled: online,
    refetchInterval: online ? 8_000 : false,
    retry: false,
  });

  const counts = useMemo(() => {
    const rows = listQuery.data?.rows ?? [];
    return {
      all: rows.length,
      running: rows.filter((r) => r.group === "running").length,
      exited: rows.filter((r) => r.group === "exited").length,
    };
  }, [listQuery.data?.rows]);

  const openContainers = useCallback(
    (group: DockerContainerGroup) => {
      setContainersOpen(true);
      setExplorerSection("containers");
      setContainerGroup(group);
      setTreeSelection(MODULE_ID, `containers:${group}`, {
        nodeId: `containers:${group}`,
        group,
      });
      openWorkspaceTab(
        {
          id: `${MODULE_ID}:docker.resources`,
          viewId: "docker.resources",
          moduleId: MODULE_ID,
          title: "Containers",
        },
        "preview",
      );
    },
    [openWorkspaceTab, setContainerGroup, setExplorerSection, setTreeSelection],
  );

  const openImages = useCallback(() => {
    setExplorerSection("images");
    setTreeSelection(MODULE_ID, "images", { nodeId: "images" });
    openWorkspaceTab(
      {
        id: `${MODULE_ID}:docker.images`,
        viewId: "docker.images",
        moduleId: MODULE_ID,
        title: "Images",
      },
      "preview",
    );
  }, [openWorkspaceTab, setExplorerSection, setTreeSelection]);

  const openVolumes = useCallback(() => {
    setExplorerSection("volumes");
    setTreeSelection(MODULE_ID, "volumes", { nodeId: "volumes" });
    openWorkspaceTab(
      {
        id: `${MODULE_ID}:docker.volumes`,
        viewId: "docker.volumes",
        moduleId: MODULE_ID,
        title: "Volumes",
      },
      "preview",
    );
  }, [openWorkspaceTab, setExplorerSection, setTreeSelection]);

  const imagesQuery = useQuery({
    queryKey: ["docker", "images", "explorer"],
    queryFn: () => dockerApi.listImages(),
    enabled: online,
    refetchInterval: online ? 12_000 : false,
    retry: false,
  });

  const volumesQuery = useQuery({
    queryKey: ["docker", "volumes", "explorer"],
    queryFn: () => dockerApi.listVolumes(),
    enabled: online,
    refetchInterval: online ? 12_000 : false,
    retry: false,
  });

  const imageCount = imagesQuery.data?.length ?? 0;
  const volumeCount = volumesQuery.data?.length ?? 0;

  const statusLabel = online
    ? `Online${apiVersion ? ` · API ${apiVersion}` : ""}`
    : engineStatus === "checking" || engineStatus === "unknown"
      ? "Checking…"
      : t("explorer.engineOffline");

  return (
    <div className="flex h-full flex-col overflow-hidden text-[13px]">
      <div className="border-b border-border-subtle px-2 py-2">
        <div className="flex items-start gap-2 px-1">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Docker
            </div>
            <p
              className={cn(
                "mt-1 text-[11px]",
                online ? "text-success" : "text-muted-foreground",
              )}
            >
              {statusLabel}
            </p>
            {!online && lastError ? (
              <p className="mt-0.5 truncate text-[11px] text-destructive" title={lastError}>
                {lastError}
              </p>
            ) : null}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 shrink-0 px-2 text-[11px]"
            disabled={pingQuery.isFetching}
            onClick={() => {
              void queryClient.invalidateQueries({ queryKey: ["docker", "engine", "ping"] });
              if (online) {
                void queryClient.invalidateQueries({ queryKey: ["docker", "containers"] });
                void queryClient.invalidateQueries({ queryKey: ["docker", "images"] });
                void queryClient.invalidateQueries({ queryKey: ["docker", "volumes"] });
              }
            }}
          >
            {t("explorer.engineRetry")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        {!online ? (
          <p className="px-3 py-2 text-[12px] text-muted-foreground">
            {t("explorer.dockerConnectHint")}
          </p>
        ) : (
          <ul className="space-y-0.5 px-1">
            <li>
              <button
                type="button"
                className="relative flex h-7 w-full items-center gap-1 rounded-[6px] px-1.5 text-left transition-colors duration-[var(--transition-fast)] hover:bg-surface-hover"
                onClick={() => {
                  setContainersOpen((v) => !v);
                  if (!containersOpen) {
                    openContainers(containerGroup);
                  }
                }}
              >
                <span
                  className="flex size-3.5 shrink-0 items-center justify-center text-[10px] text-muted-foreground"
                  aria-hidden
                >
                  {containersOpen ? "▼" : "▶"}
                </span>
                <span className="font-medium">{t("explorer.containers")}</span>
                <span className="ml-auto pr-1 font-mono text-[11px] text-muted-foreground">
                  {counts.all}
                </span>
              </button>
              {containersOpen ? (
                <ul className="ml-2 space-y-0.5 border-l border-border-subtle py-0.5 pl-1">
                  {CONTAINER_GROUPS.map((item) => {
                    const count =
                      item.id === "all"
                        ? counts.all
                        : item.id === "running"
                          ? counts.running
                          : counts.exited;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={cn(
                            "relative flex h-7 w-full items-center justify-between rounded-[6px] px-2 text-left transition-colors duration-[var(--transition-fast)] hover:bg-surface-hover",
                            containerGroup === item.id &&
                              "bg-surface-selected text-foreground lancer-select-accent",
                          )}
                          onClick={() => openContainers(item.id)}
                        >
                          <span>{item.label}</span>
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {count}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          </ul>
        )}

        <div className="mt-3 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          More
        </div>
        <ul className="space-y-0.5 px-1">
          <li>
            <button
              type="button"
              className={cn(
                "relative flex h-7 w-full items-center justify-between rounded-[6px] px-2 text-left transition-colors duration-[var(--transition-fast)] hover:bg-surface-hover",
                explorerSection === "images" &&
                  "bg-surface-selected text-foreground lancer-select-accent",
              )}
              onClick={openImages}
            >
              <span>Images</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {online ? imageCount : "—"}
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              className={cn(
                "relative flex h-7 w-full items-center justify-between rounded-[6px] px-2 text-left transition-colors duration-[var(--transition-fast)] hover:bg-surface-hover",
                explorerSection === "volumes" &&
                  "bg-surface-selected text-foreground lancer-select-accent",
              )}
              onClick={openVolumes}
            >
              <span>Volumes</span>
              <span className="font-mono text-[11px] text-muted-foreground">
                {online ? volumeCount : "—"}
              </span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}

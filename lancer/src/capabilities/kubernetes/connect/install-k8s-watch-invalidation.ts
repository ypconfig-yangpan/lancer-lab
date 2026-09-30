import type { QueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import type { ResourceWatchEvent } from "@/entities/watch/types";
import { K8S_RESOURCE_CHANGED_EVENT } from "@/entities/watch/types";
import { applyResourceWatchEvent } from "@/capabilities/kubernetes/connect/apply-resource-watch-event";
import type { DisposableStore } from "@/plugin-kernel";

/**
 * Watch 流 → 直接改 TanStack Query 列表缓存（Rancher 同款增量模型）。
 * 不再为每次事件整表 refetch。
 */
export function installK8sWatchInvalidation(
  queryClient: QueryClient,
  disposables: DisposableStore,
): void {
  let disposed = false;
  let unlisten: (() => void) | undefined;

  void listen<ResourceWatchEvent>(K8S_RESOURCE_CHANGED_EVENT, (event) => {
    if (disposed) {
      return;
    }
    applyResourceWatchEvent(queryClient, event.payload);
  })
    .then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
    })
    .catch(() => {
      // Non-Tauri / test hosts: watch cache is best-effort.
    });

  disposables.add({
    dispose: () => {
      disposed = true;
      unlisten?.();
    },
  });
}

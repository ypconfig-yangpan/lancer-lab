import type { QueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import type { DisposableStore } from "@/plugin-kernel";
import {
  JENKINS_ACTIVITY_EVENT,
  JENKINS_BUILD_EVENT,
  type NativeJenkinsActivitySnapshot,
  type NativeJenkinsBuildEvent,
} from "@/native/jenkins";
import { formatDurationMs } from "@/capabilities/jenkins/format";
import { jenkinsKeys } from "./use-jenkins-queries";

/**
 * Webhook / 轮询兜底 → 领域事件 + activity 快照 → Query 缓存。
 */
export function installJenkinsActivityListen(
  queryClient: QueryClient,
  disposables: DisposableStore,
): void {
  let disposed = false;
  let unlistenActivity: (() => void) | undefined;
  let unlistenBuild: (() => void) | undefined;

  void listen<NativeJenkinsActivitySnapshot>(JENKINS_ACTIVITY_EVENT, (event) => {
    if (disposed) return;
    const snap = event.payload;
    queryClient.setQueryData(jenkinsKeys.queue(), snap.queue);
    queryClient.setQueryData(jenkinsKeys.executors(), snap.executors);
  })
    .then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlistenActivity = fn;
    })
    .catch(() => {});

  void listen<NativeJenkinsBuildEvent>(JENKINS_BUILD_EVENT, (event) => {
    if (disposed) return;
    applyBuildEvent(queryClient, event.payload);
  })
    .then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlistenBuild = fn;
    })
    .catch(() => {});

  disposables.add({
    dispose: () => {
      disposed = true;
      unlistenActivity?.();
      unlistenBuild?.();
    },
  });
}

function applyBuildEvent(queryClient: QueryClient, ev: NativeJenkinsBuildEvent): void {
  void queryClient.invalidateQueries({ queryKey: jenkinsKeys.jobs() });
  void queryClient.invalidateQueries({ queryKey: jenkinsKeys.queue() });
  void queryClient.invalidateQueries({ queryKey: jenkinsKeys.executors() });
  if (ev.jobFullName) {
    void queryClient.invalidateQueries({ queryKey: jenkinsKeys.builds(ev.jobFullName) });
    if (ev.number != null) {
      void queryClient.invalidateQueries({
        queryKey: jenkinsKeys.build(ev.jobFullName, ev.number),
      });
    }
  }

  const shortJob = ev.jobFullName.split("/").pop() || ev.jobFullName;
  const num = ev.number != null ? ` #${ev.number}` : "";
  if (ev.kind === "buildStarted") {
    toast.message(`${shortJob}${num} · 构建中`, {
      description: ev.source === "webhook" ? "Webhook" : "轮询兜底",
    });
  } else if (ev.kind === "buildCompleted") {
    const result = ev.result || "COMPLETED";
    const dur = ev.durationMs != null ? ` · ${formatDurationMs(ev.durationMs)}` : "";
    if (result === "SUCCESS") {
      toast.success(`${shortJob}${num} · 成功${dur}`);
    } else if (result === "FAILURE" || result === "ABORTED") {
      toast.error(`${shortJob}${num} · ${result}${dur}`);
    } else {
      toast.message(`${shortJob}${num} · ${result}${dur}`);
    }
  }
}

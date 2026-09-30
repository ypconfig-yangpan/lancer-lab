import type { JenkinsQueueItem } from "@/capabilities/jenkins/api";

/** Build Now 返回的 Location：…/queue/item/11938/ */
export function parseQueueItemId(queueUrl: string): number | null {
  const m = queueUrl.match(/\/queue\/item\/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function optimisticQueueItem(input: {
  id: number;
  jobFullName: string;
}): JenkinsQueueItem {
  const name = input.jobFullName.split("/").pop() || input.jobFullName;
  return {
    id: input.id,
    taskName: name,
    taskFullName: input.jobFullName,
    taskUrl: "",
    why: "已触发，等待进入执行器（安静期/排队）…",
    stuck: false,
    blocked: false,
    buildable: false,
    pending: true,
    inQueueSince: Date.now(),
    params: "",
    causes: "",
    url: `queue/item/${input.id}/`,
  };
}

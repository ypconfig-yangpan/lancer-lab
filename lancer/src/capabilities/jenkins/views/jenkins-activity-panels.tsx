import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useCancelJenkinsQueueItem,
  useJenkinsExecutors,
  useJenkinsQueue,
  useStopJenkinsBuild,
} from "@/capabilities/jenkins/connect/use-jenkins-queries";
import { formatBuildTime } from "@/capabilities/jenkins/format";
import type { JenkinsQueueItem } from "@/capabilities/jenkins/api";
import { PanelCard, StatusDot } from "@/shared/dashboard-ui";
import { formatAppError } from "@/shared/lib/app-error";
import { useJenkinsUiStore } from "../mock/jenkins-ui-store";

function queueStateLabel(item: JenkinsQueueItem): string {
  if (item.stuck) return "卡住";
  if (item.pending) return "即将开始";
  if (item.blocked) return "阻塞";
  if (item.buildable) return "等待执行器";
  if (item.why.toLowerCase().includes("quiet")) return "安静期";
  return "排队中";
}

function queueStateTone(item: JenkinsQueueItem): "success" | "danger" | "info" | "warning" {
  if (item.stuck) return "danger";
  if (item.blocked) return "warning";
  return "info";
}

/**
 * 构建队列 + 执行器。Dashboard / 详情都应挂上；
 * 订阅与页面共存，避免只在列表页才看得到。
 */
export function JenkinsActivityPanels({ compact = false }: { compact?: boolean }) {
  const queueQuery = useJenkinsQueue(true);
  const executorsQuery = useJenkinsExecutors(true);
  const cancelQueue = useCancelJenkinsQueueItem();
  const stopMutation = useStopJenkinsBuild();
  const openDetail = useJenkinsUiStore((s) => s.openDetail);
  const setPreview = useJenkinsUiStore((s) => s.setPreview);

  const queue = queueQuery.data ?? [];
  const exec = executorsQuery.data;
  const maxH = compact ? "max-h-[160px]" : "max-h-[220px]";

  return (
    <div className={compact ? "grid gap-3 md:grid-cols-2" : "flex flex-col gap-3"}>
      <PanelCard
        title="构建队列"
        action={
          <span className="text-[11px] text-muted-foreground">{queue.length} · 事件驱动</span>
        }
      >
        {queue.length === 0 ? (
          <p className="px-4 py-4 text-[12px] text-muted-foreground">
            队列为空（安静期约数秒；结束后进「构建执行状态」）
          </p>
        ) : (
          <ul className={`${maxH} divide-y divide-border-subtle overflow-auto`}>
            {queue.map((item) => (
              <li key={item.id} className="flex items-start gap-2 px-4 py-2.5 text-[12px]">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="truncate font-medium text-primary hover:underline"
                      onClick={() => {
                        const id = item.taskFullName || item.taskName;
                        if (id) openDetail(id);
                      }}
                    >
                      {item.taskName || `item #${item.id}`}
                    </button>
                    <StatusDot label={queueStateLabel(item)} tone={queueStateTone(item)} />
                  </div>
                  <div className="mt-0.5 text-muted-foreground">{item.why || "waiting…"}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                    {item.causes ? <span>{item.causes}</span> : null}
                    {item.inQueueSince ? (
                      <span>入队 {formatBuildTime(item.inQueueSince)}</span>
                    ) : null}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={cancelQueue.isPending}
                  onClick={() => {
                    void cancelQueue.mutateAsync(item.id).then(
                      () => toast.success("已取消排队"),
                      (err: unknown) => toast.error(formatAppError(err).message),
                    );
                  }}
                >
                  取消
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>

      <PanelCard
        title="构建执行状态"
        action={
          <span className="text-[11px] text-muted-foreground">
            {exec ? `${exec.busy}/${exec.total}` : "—"} · 事件驱动
          </span>
        }
      >
        {!exec || exec.running.length === 0 ? (
          <p className="px-4 py-4 text-[12px] text-muted-foreground">
            {exec && exec.total > 0 ? "没有正在执行的构建" : "暂无执行器信息"}
          </p>
        ) : (
          <ul className={`${maxH} divide-y divide-border-subtle overflow-auto`}>
            {exec.running.map((r) => (
              <li
                key={`${r.jobFullName}#${r.number}@${r.nodeName}`}
                className="flex items-start gap-2 px-4 py-2.5 text-[12px]"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="truncate font-medium text-primary hover:underline"
                    onClick={() => {
                      if (r.jobFullName) {
                        openDetail(r.jobFullName);
                        setPreview(r.jobFullName, r.number);
                      }
                    }}
                  >
                    {r.displayName || `${r.jobFullName} #${r.number}`}
                  </button>
                  <div className="mt-0.5 text-muted-foreground">
                    节点 {r.nodeName || "—"} · #{r.number}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!r.jobFullName || stopMutation.isPending}
                  onClick={() => {
                    if (!r.jobFullName) return;
                    void stopMutation
                      .mutateAsync({ jobFullName: r.jobFullName, number: r.number })
                      .then(
                        () => toast.success(`已请求停止 #${r.number}`),
                        (err: unknown) => toast.error(formatAppError(err).message),
                      );
                  }}
                >
                  Stop
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  );
}

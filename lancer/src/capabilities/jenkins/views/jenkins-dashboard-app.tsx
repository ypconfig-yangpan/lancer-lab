import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CompactSelect } from "@/components/ui/compact-select";
import { useEnsureJenkinsConnection } from "@/capabilities/jenkins/connect/use-ensure-jenkins-connection";
import {
  jenkinsKeys,
  useBuildJenkinsJob,
  useJenkinsBuildDetail,
  useJenkinsBuilds,
  useJenkinsExecutors,
  useJenkinsJobDetail,
  useJenkinsJobs,
  useJenkinsQueue,
  useStopJenkinsBuild,
} from "@/capabilities/jenkins/connect/use-jenkins-queries";
import {
  formatBuildClock,
  formatBuildDateGroup,
  formatBuildTime,
  formatDurationMs,
  jobTypeLabel,
} from "@/capabilities/jenkins/format";
import type { JenkinsBuildSummary, JenkinsJobSummary } from "@/capabilities/jenkins/api";
import { JenkinsActivityPanels } from "@/capabilities/jenkins/views/jenkins-activity-panels";
import { JenkinsBuildProgressBar } from "@/capabilities/jenkins/views/jenkins-build-progress-bar";
import { JenkinsConsolePane } from "@/capabilities/jenkins/views/jenkins-console-pane";
import { JenkinsJobConfigPane } from "@/capabilities/jenkins/views/jenkins-job-config-pane";
import {
  DashboardHeader,
  DashboardPage,
  PageTabsBar,
  PanelCard,
  StatCard,
  StatusDot,
} from "@/shared/dashboard-ui";
import { formatAppError } from "@/shared/lib/app-error";
import { cn } from "@/shared/lib/utils";
import { useJenkinsUiStore } from "../mock/jenkins-ui-store";

function buildTone(status: string): "success" | "danger" | "info" | "warning" {
  if (status === "SUCCESS") return "success";
  if (status === "FAILURE" || status === "ABORTED") return "danger";
  if (status === "RUNNING" || status === "UNSTABLE") return "warning";
  return "info";
}

function hostLabel(baseUrl: string) {
  return baseUrl.replace(/^https?:\/\//, "") || "jenkins";
}

/** Live Jenkins workspace: connect ~/.lancer/jenkins.json → Jobs / Builds / Console. */
export function JenkinsDashboardApp() {
  const { connecting, connected, status, error, paused } = useEnsureJenkinsConnection();
  const page = useJenkinsUiStore((s) => s.page);

  if (connecting && !connected) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        正在连接 Jenkins…
      </div>
    );
  }

  if ((error || paused) && !connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-[13px]">
        <p className={paused ? "text-foreground" : "text-destructive"}>
          {paused ? "Jenkins 已断开" : `连接失败：${error}`}
        </p>
        <p className="text-muted-foreground">
          {paused
            ? "配置仍在，到「凭证」点「连接」即可恢复"
            : "请到侧栏「凭证」填写 Jenkins URL / 用户名 / API Token"}
        </p>
      </div>
    );
  }

  if (page === "detail") {
    return <JobDetailPage serverLabel={status?.baseUrl ?? ""} />;
  }
  return (
    <JenkinsDashboardPage
      serverLabel={status?.baseUrl ?? ""}
      username={status?.username ?? ""}
      webhookEnabled={status?.webhookEnabled === true}
      webhookUrl={status?.webhookUrl ?? ""}
    />
  );
}

function JenkinsDashboardPage({
  serverLabel,
  username,
  webhookEnabled,
  webhookUrl,
}: {
  serverLabel: string;
  username: string;
  webhookEnabled: boolean;
  webhookUrl: string;
}) {
  const queryClient = useQueryClient();
  const section = useJenkinsUiStore((s) => s.section);
  const openDetail = useJenkinsUiStore((s) => s.openDetail);
  const previewJobId = useJenkinsUiStore((s) => s.previewJobId);
  const previewBuildNumber = useJenkinsUiStore((s) => s.previewBuildNumber);
  const setPreview = useJenkinsUiStore((s) => s.setPreview);
  const [folder, setFolder] = useState<string>("all");

  const jobsProbe = useJenkinsJobs(true, false);
  const buildingCount = (jobsProbe.data ?? []).filter((j) => j.building).length;
  // 队列/执行器：前端只 listen；jobs 在有活动时快刷
  const queueProbe = useJenkinsQueue(true);
  const hot = buildingCount > 0 || (queueProbe.data?.length ?? 0) > 0;

  const jobsQuery = useJenkinsJobs(true, hot);
  const executorsQuery = useJenkinsExecutors(true);

  const jobs = jobsQuery.data ?? [];
  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const j of jobs) {
      if (j.folder) set.add(j.folder);
    }
    return [...set].sort();
  }, [jobs]);

  const filtered = useMemo(() => {
    if (folder === "all") return jobs;
    return jobs.filter((j) => j.folder === folder);
  }, [jobs, folder]);

  const building = filtered.filter((j) => j.building).length;
  const withResult = filtered.filter((j) => j.lastBuildResult && j.lastBuildResult !== "NOT_BUILT");
  const success = withResult.filter((j) => j.lastBuildResult === "SUCCESS").length;
  const successRate =
    withResult.length === 0 ? "—" : `${Math.round((success / withResult.length) * 100)}%`;

  const avgDuration = useMemo(() => {
    const durations = filtered
      .map((j) => j.lastBuildDurationMs)
      .filter((ms): ms is number => ms != null && ms > 0);
    if (durations.length === 0) return "—";
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    return formatDurationMs(avg);
  }, [filtered]);

  const recent = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.building !== b.building) return a.building ? -1 : 1;
      return (b.lastBuildTimestamp ?? 0) - (a.lastBuildTimestamp ?? 0);
    });
  }, [filtered]);

  const trendPoints = useMemo(() => {
    return recent
      .filter((j) => j.lastBuildNumber != null)
      .slice(0, 12)
      .reverse()
      .map((j) => {
        if (j.building) return 0.55;
        if (j.lastBuildResult === "SUCCESS") return 1;
        if (j.lastBuildResult === "FAILURE" || j.lastBuildResult === "ABORTED") return 0.15;
        return 0.4;
      });
  }, [recent]);

  const exec = executorsQuery.data;

  useEffect(() => {
    if (recent.length === 0) {
      setPreview(null, null);
      return;
    }
    const still =
      previewJobId &&
      recent.some(
        (j) => j.fullName === previewJobId && j.lastBuildNumber === previewBuildNumber,
      );
    if (still) return;
    const first = recent.find((j) => j.lastBuildNumber != null) ?? recent[0];
    if (first?.lastBuildNumber != null) {
      setPreview(first.fullName, first.lastBuildNumber);
    }
  }, [recent, previewJobId, previewBuildNumber, setPreview]);

  const previewJob = recent.find((j) => j.fullName === previewJobId) ?? null;
  const previewFollow = previewJob?.building === true;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: jenkinsKeys.all });
    toast.message("已刷新");
  };

  const title = section === "history" ? "构建历史" : "状态";
  const buildMutation = useBuildJenkinsJob();

  return (
    <DashboardPage>
      <DashboardHeader
        title={title}
        badge={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-white px-2.5 py-0.5 text-[12px]">
            <span
              className={cn("size-1.5 rounded-full", building > 0 ? "bg-warning" : "bg-success")}
            />
            <span>{building > 0 ? "构建中" : "运行中"}</span>
            <span className="text-muted-foreground">·</span>
            <span
              className="text-muted-foreground"
              title={
                webhookEnabled && webhookUrl
                  ? `Webhook ${webhookUrl} · 轮询兜底`
                  : "仅轮询兜底（可在 ~/.lancer/jenkins.json 开启 webhook）"
              }
            >
              {webhookEnabled ? "Webhook+轮询" : "轮询兜底"}
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="max-w-[220px] truncate font-mono" title={serverLabel}>
              {hostLabel(serverLabel)}
            </span>
            {username ? <span className="text-muted-foreground">· {username}</span> : null}
          </span>
        }
        trailing={
          <CompactSelect
            size="md"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            aria-label="Folder"
            triggerClassName="min-w-[120px]"
          >
            <option value="all">全部 Folder</option>
            {folders.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </CompactSelect>
        }
        onRefresh={refresh}
      />

      {section === "jobs" ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="任务总数" value={String(filtered.length)} hint={folder === "all" ? "all" : folder} />
          <StatCard
            label="正在构建"
            value={String(building)}
            tone={building > 0 ? "warning" : "info"}
            hint={exec ? `执行器 ${exec.busy}/${exec.total}` : hot ? "快刷中" : "idle"}
          />
          <StatCard label="构建成功率" value={successRate} tone="success" hint="按最近一次构建" />
          <StatCard label="平均构建时间" value={avgDuration} hint="最近一次耗时均值" />
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        <PanelCard
          title={section === "history" ? "全局最近构建" : "项目状态"}
          className="lg:col-span-2"
        >
          {jobsQuery.isError ? (
            <p className="px-4 py-6 text-[12px] text-destructive">
              {jobsQuery.error instanceof Error ? jobsQuery.error.message : "加载失败"}
            </p>
          ) : recent.length === 0 ? (
            <p className="px-4 py-6 text-[12px] text-muted-foreground">
              {jobsQuery.isLoading ? "加载中…" : "暂无 Job"}
            </p>
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full border-collapse text-left text-[13px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-border-subtle text-[11px] text-muted-foreground">
                    {(section === "history"
                      ? ["任务名称", "状态", "构建编号", "耗时", "时间"]
                      : ["S", "名称", "上次成功", "上次失败", "上次持续时间", ""]
                    ).map((h) => (
                      <th key={h || "action"} className="h-9 px-3 font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map((j) => {
                    const selected =
                      j.fullName === previewJobId && j.lastBuildNumber === previewBuildNumber;
                    if (section === "history") {
                      return (
                        <HistoryJobRow
                          key={j.fullName}
                          job={j}
                          selected={selected}
                          onSelect={() => {
                            if (j.lastBuildNumber != null) {
                              setPreview(j.fullName, j.lastBuildNumber);
                            }
                          }}
                          onOpen={() => openDetail(j.fullName)}
                        />
                      );
                    }
                    return (
                      <StatusJobRow
                        key={j.fullName}
                        job={j}
                        selected={selected}
                        buildingBusy={buildMutation.isPending}
                        onSelect={() => {
                          if (j.lastBuildNumber != null) {
                            setPreview(j.fullName, j.lastBuildNumber);
                          }
                        }}
                        onOpen={() => openDetail(j.fullName)}
                        onBuild={() => {
                          void buildMutation
                            .mutateAsync({ jobFullName: j.fullName, parameters: {} })
                            .then(
                              () => {
                                setPreview(j.fullName, j.lastBuildNumber);
                                toast.success(`已触发：${j.name}`);
                              },
                              (err: unknown) => toast.error(formatAppError(err).message),
                            );
                        }}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>

        <div className="flex flex-col gap-3">
          {section === "jobs" ? (
            <PanelCard title="构建趋势">
              <div className="p-4">
                <TrendBars points={trendPoints} />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  最近 {trendPoints.length || 0} 次结果（绿成功 / 红失败）
                </p>
              </div>
            </PanelCard>
          ) : null}
          <JenkinsActivityPanels />
        </div>
      </div>

      {previewJobId && previewBuildNumber != null ? (
        <JenkinsConsolePane
          jobFullName={previewJobId}
          number={previewBuildNumber}
          follow={previewFollow}
          title={`最近日志 · ${previewJob?.name ?? previewJobId} #${previewBuildNumber}${previewFollow ? " · 实时" : ""}`}
        />
      ) : (
        <PanelCard title="最近日志">
          <p className="px-4 py-6 text-[12px] text-muted-foreground">
            在上方表格选中一次构建以预览日志
          </p>
        </PanelCard>
      )}
    </DashboardPage>
  );
}

function TrendBars({ points }: { points: number[] }) {
  if (points.length === 0) {
    return <div className="flex h-16 items-end text-[12px] text-muted-foreground">暂无数据</div>;
  }
  return (
    <div className="flex h-16 items-end gap-1">
      {points.map((p, i) => {
        const h = Math.max(12, Math.round(p * 56));
        const tone =
          p >= 0.9 ? "bg-success" : p <= 0.25 ? "bg-destructive" : "bg-primary/60";
        return (
          <div
            key={`${i}-${p}`}
            className={cn("w-full max-w-[14px] rounded-t-[3px]", tone)}
            style={{ height: h }}
            title={p >= 0.9 ? "SUCCESS" : p <= 0.25 ? "FAILURE" : "OTHER"}
          />
        );
      })}
    </div>
  );
}

function formatBuildRef(number: number | null | undefined, timestamp: number | null | undefined) {
  if (number == null) return "无";
  return `${formatBuildTime(timestamp)} #${number}`;
}

function StatusJobRow({
  job,
  selected,
  buildingBusy,
  onSelect,
  onOpen,
  onBuild,
}: {
  job: JenkinsJobSummary;
  selected: boolean;
  buildingBusy: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onBuild: () => void;
}) {
  const status = job.building ? "RUNNING" : job.lastBuildResult || "NOT_BUILT";
  return (
    <tr
      className={cn(
        "h-11 cursor-pointer border-b border-border-subtle/80 hover:bg-surface-hover",
        job.building && "bg-amber-50",
        selected && "bg-primary/5",
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <td className="w-14 px-3">
        <StatusDot label={status === "NOT_BUILT" ? "—" : status} tone={buildTone(status)} />
      </td>
      <td className="px-3">
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {job.name}
        </button>
        {job.folder ? (
          <div className="font-mono text-[11px] text-muted-foreground">{job.folder}</div>
        ) : null}
      </td>
      <td className="px-3 text-[12px] text-muted-foreground">
        {formatBuildRef(job.lastSuccessfulNumber, job.lastSuccessfulTimestamp)}
      </td>
      <td className="px-3 text-[12px] text-muted-foreground">
        {formatBuildRef(job.lastFailedNumber, job.lastFailedTimestamp)}
      </td>
      <td className="px-3 text-muted-foreground">{formatDurationMs(job.lastBuildDurationMs)}</td>
      <td className="w-16 px-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={job.building || buildingBusy}
          title="立即构建"
          onClick={(e) => {
            e.stopPropagation();
            onBuild();
          }}
        >
          ▶
        </Button>
      </td>
    </tr>
  );
}

function HistoryJobRow({
  job,
  selected,
  onSelect,
  onOpen,
}: {
  job: JenkinsJobSummary;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const status = job.building ? "RUNNING" : job.lastBuildResult || "NOT_BUILT";
  return (
    <tr
      className={cn(
        "h-11 cursor-pointer border-b border-border-subtle/80 hover:bg-surface-hover",
        job.building && "bg-amber-50",
        selected && "bg-primary/5",
      )}
      onClick={onSelect}
      onDoubleClick={onOpen}
    >
      <td className="px-4">
        <button
          type="button"
          className="font-medium text-primary hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {job.name}
        </button>
        {job.folder ? (
          <div className="font-mono text-[11px] text-muted-foreground">{job.folder}</div>
        ) : null}
      </td>
      <td className="px-4">
        <StatusDot label={status} tone={buildTone(status)} />
      </td>
      <td className="px-4 font-mono text-[12px]">
        {job.lastBuildNumber != null ? `#${job.lastBuildNumber}` : "—"}
      </td>
      <td className="px-4 text-muted-foreground">{formatDurationMs(job.lastBuildDurationMs)}</td>
      <td className="px-4 text-muted-foreground">{formatBuildTime(job.lastBuildTimestamp)}</td>
    </tr>
  );
}

function JobDetailPage({ serverLabel }: { serverLabel: string }) {
  const openDashboard = useJenkinsUiStore((s) => s.openDashboard);
  const selectedJobId = useJenkinsUiStore((s) => s.selectedJobId);
  const detailTab = useJenkinsUiStore((s) => s.detailTab);
  const setDetailTab = useJenkinsUiStore((s) => s.setDetailTab);

  const jobsQuery = useJenkinsJobs(true, false);
  const job = (jobsQuery.data ?? []).find((j) => j.fullName === selectedJobId) ?? null;
  const hot = job?.building === true;
  const buildsQuery = useJenkinsBuilds(selectedJobId, !!selectedJobId, hot);
  const detailQuery = useJenkinsJobDetail(selectedJobId, !!selectedJobId);
  const buildMutation = useBuildJenkinsJob();
  const stopMutation = useStopJenkinsBuild();

  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [selectedBuildNumber, setSelectedBuildNumber] = useState<number | null>(null);

  const builds = buildsQuery.data ?? [];

  useEffect(() => {
    if (!detailQuery.data) return;
    const next: Record<string, string> = {};
    for (const p of detailQuery.data.parameters) {
      next[p.name] = p.defaultValue;
    }
    setParamValues(next);
  }, [detailQuery.data]);

  useEffect(() => {
    if (builds.length === 0) {
      setSelectedBuildNumber(null);
      return;
    }
    setSelectedBuildNumber((current) => {
      // 有进行中的构建时始终跟最新 RUNNING（Build Now 后不要粘在旧 #）
      const running = builds.find((b) => b.building);
      if (running) return running.number;
      if (current && builds.some((b) => b.number === current)) return current;
      return builds[0]?.number ?? null;
    });
  }, [builds]);

  const selectedBuild = builds.find((b) => b.number === selectedBuildNumber) ?? null;
  const buildDetailQuery = useJenkinsBuildDetail(
    selectedJobId,
    selectedBuildNumber,
    selectedBuildNumber != null,
  );

  if (!selectedJobId) {
    return (
      <DashboardPage>
        <p className="text-[13px] text-muted-foreground">未选择 Job</p>
        <Button variant="secondary" size="sm" onClick={() => openDashboard()}>
          返回
        </Button>
      </DashboardPage>
    );
  }

  const runBuild = async () => {
    try {
      await buildMutation.mutateAsync({
        jobFullName: selectedJobId,
        parameters: paramValues,
      });
      toast.success(`已触发构建：${selectedJobId}`);
    } catch (err: unknown) {
      toast.error(formatAppError(err).message);
    }
  };

  const runStop = async () => {
    if (!selectedBuildNumber) return;
    try {
      await stopMutation.mutateAsync({
        jobFullName: selectedJobId,
        number: selectedBuildNumber,
      });
      toast.success(`已请求停止 #${selectedBuildNumber}`);
    } catch (err: unknown) {
      toast.error(formatAppError(err).message);
    }
  };

  return (
    <DashboardPage>
      <div className="text-[12px] text-muted-foreground">
        <button type="button" className="hover:text-primary" onClick={() => openDashboard()}>
          Jenkins
        </button>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">任务详情</span>
        <span className="mx-1.5">·</span>
        <span className="font-mono text-[11px]">{hostLabel(serverLabel)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[20px] font-semibold">{job?.name ?? selectedJobId}</h1>
        {job ? (
          <StatusDot
            label={job.building ? "RUNNING" : job.lastBuildResult || "NOT_BUILT"}
            tone={buildTone(job.building ? "RUNNING" : job.lastBuildResult)}
          />
        ) : null}
        {job?.building ? (
          <span className="text-[12px] text-muted-foreground">构建进行中 · 见下方进度与最近构建</span>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={!selectedBuild?.building || stopMutation.isPending}
            onClick={() => void runStop()}
          >
            Stop
          </Button>
          <Button
            size="sm"
            disabled={detailQuery.data?.buildable === false || buildMutation.isPending}
            onClick={() => void runBuild()}
          >
            {buildMutation.isPending ? "触发中…" : "立即构建"}
          </Button>
        </div>
      </div>

      {(selectedBuild?.building || buildDetailQuery.data?.building) &&
      (buildDetailQuery.data?.timestamp || selectedBuild?.timestamp) ? (
        <JenkinsBuildProgressBar
          building
          buildNumber={selectedBuildNumber}
          startedAtMs={
            buildDetailQuery.data?.timestamp || selectedBuild?.timestamp || Date.now()
          }
          estimatedDurationMs={buildDetailQuery.data?.estimatedDurationMs ?? 0}
        />
      ) : null}

      <PageTabsBar
        items={[
          { id: "overview", label: "状态" },
          { id: "changes", label: "修改记录" },
          { id: "history", label: "构建" },
          { id: "config", label: "配置" },
          { id: "workspace", label: "工作空间", disabled: true },
        ]}
        value={detailTab}
        onChange={(id) =>
          setDetailTab(id as "overview" | "changes" | "history" | "config")
        }
      />

      {detailTab === "overview" ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
          <div className="flex flex-col gap-3">
            <PanelCard title="相关链接">
              <ul className="divide-y divide-border-subtle text-[13px]">
                {(
                  [
                    [
                      "最近构建",
                      job?.lastBuildNumber,
                      job?.lastBuildTimestamp,
                      job?.building ? "RUNNING" : job?.lastBuildResult,
                    ],
                    [
                      "最近稳定",
                      job?.lastSuccessfulNumber,
                      job?.lastSuccessfulTimestamp,
                      "SUCCESS",
                    ],
                    [
                      "最近成功",
                      job?.lastSuccessfulNumber,
                      job?.lastSuccessfulTimestamp,
                      "SUCCESS",
                    ],
                    [
                      "最近完成",
                      job?.lastBuildNumber,
                      job?.lastBuildTimestamp,
                      job?.building ? "RUNNING" : job?.lastBuildResult,
                    ],
                  ] as const
                ).map(([label, num, ts, st]) => (
                  <li key={label}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-hover",
                        num == null && "cursor-default text-muted-foreground",
                      )}
                      disabled={num == null}
                      onClick={() => {
                        if (num != null) setSelectedBuildNumber(num);
                      }}
                    >
                      <span className="min-w-[72px] text-muted-foreground">{label}</span>
                      {num == null ? (
                        <span>无</span>
                      ) : (
                        <>
                          <span className="font-mono text-primary">#{num}</span>
                          <StatusDot
                            label={String(st || "—")}
                            tone={buildTone(String(st || ""))}
                          />
                          <span className="ml-auto text-[12px] text-muted-foreground">
                            {formatBuildTime(ts)}
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </PanelCard>

            {(detailQuery.data?.parameters?.length ?? 0) > 0 ? (
              <PanelCard title="构建参数">
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {detailQuery.data!.parameters.map((p) => (
                    <label key={p.name} className="flex flex-col gap-1 text-[12px]">
                      <span className="text-muted-foreground">{p.name}</span>
                      {p.choices.length > 0 ? (
                        <CompactSelect
                          className="w-full"
                          triggerClassName="w-full"
                          size="md"
                          value={paramValues[p.name] ?? p.defaultValue}
                          onChange={(e) =>
                            setParamValues((prev) => ({
                              ...prev,
                              [p.name]: e.target.value,
                            }))
                          }
                        >
                          {p.choices.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </CompactSelect>
                      ) : (
                        <input
                          className="h-8 rounded-md border border-border-subtle bg-white px-2 font-mono text-[12px]"
                          value={paramValues[p.name] ?? ""}
                          onChange={(e) =>
                            setParamValues((prev) => ({
                              ...prev,
                              [p.name]: e.target.value,
                            }))
                          }
                        />
                      )}
                    </label>
                  ))}
                </div>
              </PanelCard>
            ) : null}

            <PanelCard title="基本信息">
              <dl className="grid grid-cols-2 gap-3 p-4 text-[13px]">
                {[
                  ["名称", job?.name ?? selectedJobId],
                  ["完整名", selectedJobId],
                  ["Folder", job?.folder || "—"],
                  ["类型", job ? jobTypeLabel(job.className) : "—"],
                  ["可构建", detailQuery.data?.buildable === false ? "false" : "true"],
                ].map(([k, v]) => (
                  <div key={k} className={k === "完整名" ? "col-span-2" : undefined}>
                    <dt className="text-[11px] text-muted-foreground">{k}</dt>
                    <dd className="truncate font-mono text-[12px]" title={v}>
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
              {buildDetailQuery.data ? (
                <dl className="grid grid-cols-2 gap-3 border-t border-border-subtle p-4 text-[13px]">
                  {[
                    ["选中构建", `#${buildDetailQuery.data.number}`],
                    ["触发原因", buildDetailQuery.data.cause || "—"],
                    ["节点", buildDetailQuery.data.builtOn || "—"],
                    [
                      "状态",
                      buildDetailQuery.data.building
                        ? "RUNNING"
                        : buildDetailQuery.data.result || "—",
                    ],
                    ["耗时", formatDurationMs(buildDetailQuery.data.durationMs)],
                  ].map(([k, v]) => (
                    <div key={k} className={k === "触发原因" ? "col-span-2" : undefined}>
                      <dt className="text-[11px] text-muted-foreground">{k}</dt>
                      <dd className="truncate text-[12px]" title={v}>
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </PanelCard>
          </div>

          <PanelCard title="Builds">
            <BuildsSideList
              rows={builds}
              selectedNumber={selectedBuildNumber}
              loading={buildsQuery.isLoading}
              error={
                buildsQuery.isError
                  ? buildsQuery.error instanceof Error
                    ? buildsQuery.error.message
                    : "加载失败"
                  : null
              }
              onSelect={setSelectedBuildNumber}
              onOpenChanges={(n) => {
                setSelectedBuildNumber(n);
                setDetailTab("changes");
              }}
            />
          </PanelCard>
        </div>
      ) : null}

      {detailTab === "changes" ? (
        <PanelCard
          title={
            selectedBuildNumber != null
              ? `修改记录 · #${selectedBuildNumber}`
              : "修改记录"
          }
        >
          {(buildDetailQuery.data?.changes?.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-[12px] text-muted-foreground">
              {buildDetailQuery.isLoading
                ? "加载中…"
                : "本次构建没有变更记录（或 Jenkins 未返回 changeSet）"}
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {buildDetailQuery.data!.changes.map((c, i) => (
                <li key={`${c.commitId}-${i}`} className="px-4 py-3 text-[13px]">
                  <div className="font-medium">{c.message || "(no message)"}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                    {c.author ? <span>{c.author}</span> : null}
                    {c.commitId ? (
                      <span className="font-mono">{c.commitId.slice(0, 10)}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      ) : null}

      {detailTab === "history" ? (
        <PanelCard title="构建">
          <HistoryTable
            rows={builds}
            selectedNumber={selectedBuildNumber}
            loading={buildsQuery.isLoading}
            error={
              buildsQuery.isError
                ? buildsQuery.error instanceof Error
                  ? buildsQuery.error.message
                  : "加载失败"
                : null
            }
            onSelect={setSelectedBuildNumber}
          />
        </PanelCard>
      ) : null}

      {detailTab === "config" ? <JenkinsJobConfigPane jobFullName={selectedJobId} /> : null}

      {detailTab !== "config" && selectedBuildNumber != null ? (
        <JenkinsConsolePane
          jobFullName={selectedJobId}
          number={selectedBuildNumber}
          follow={selectedBuild?.building === true || buildDetailQuery.data?.building === true}
        />
      ) : null}
    </DashboardPage>
  );
}

function BuildsSideList({
  rows,
  selectedNumber,
  loading,
  error,
  onSelect,
  onOpenChanges,
}: {
  rows: JenkinsBuildSummary[];
  selectedNumber: number | null;
  loading?: boolean;
  error?: string | null;
  onSelect: (n: number) => void;
  onOpenChanges: (n: number) => void;
}) {
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().replace(/^#/, "");
    if (!q) return rows;
    return rows.filter(
      (b) =>
        String(b.number).includes(q) ||
        (b.building ? "RUNNING" : b.result).toLowerCase().includes(q.toLowerCase()),
    );
  }, [rows, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, JenkinsBuildSummary[]>();
    for (const b of filtered) {
      const key =
        b.timestamp > 0 ? formatBuildDateGroup(b.timestamp) : "未知日期";
      const list = map.get(key) ?? [];
      list.push(b);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  if (error) {
    return <p className="px-3 py-4 text-[12px] text-destructive">{error}</p>;
  }
  if (loading && rows.length === 0) {
    return <p className="px-3 py-4 text-[12px] text-muted-foreground">加载中…</p>;
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-border-subtle px-3 py-2">
        <input
          className="h-8 w-full rounded-md border border-border-subtle bg-white px-2 text-[12px] outline-none focus:border-primary"
          placeholder="过滤构建…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {groups.length === 0 ? (
        <p className="px-3 py-4 text-[12px] text-muted-foreground">暂无构建记录</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          {groups.map(([dateLabel, items]) => (
            <div key={dateLabel}>
              <div className="sticky top-0 bg-white px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
                {dateLabel}
              </div>
              <ul>
                {items.map((b) => {
                  const selected = b.number === selectedNumber;
                  const open = expanded === b.number;
                  const status = b.building ? "RUNNING" : b.result;
                  return (
                    <li
                      key={b.id}
                      className={cn(
                        "border-b border-border-subtle/60",
                        selected && "bg-primary/5",
                        b.building && "bg-amber-50",
                      )}
                    >
                      <div className="flex items-center gap-1 px-2 py-1.5">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-surface-hover"
                          onClick={() => onSelect(b.number)}
                        >
                          <span
                            className={cn(
                              "size-2 shrink-0 rounded-full",
                              buildTone(status) === "success" && "bg-success",
                              buildTone(status) === "danger" && "bg-destructive",
                              buildTone(status) === "warning" && "bg-warning",
                              buildTone(status) === "info" && "bg-primary",
                            )}
                            title={status}
                          />
                          <span className="font-mono text-[12px] font-medium text-primary">
                            #{b.number}
                          </span>
                          <span className="ml-auto truncate text-[11px] text-muted-foreground">
                            {b.timestamp > 0 ? formatBuildClock(b.timestamp) : "—"}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="shrink-0 px-1 text-[11px] text-muted-foreground hover:text-foreground"
                          aria-label={open ? "收起" : "展开"}
                          onClick={() =>
                            setExpanded((cur) => (cur === b.number ? null : b.number))
                          }
                        >
                          {open ? "▾" : "▸"}
                        </button>
                      </div>
                      {open ? (
                        <div className="space-y-1 border-t border-border-subtle/50 bg-white px-3 py-2 text-[11px] text-muted-foreground">
                          <div>
                            状态{" "}
                            <span className="text-foreground">
                              {b.building ? "RUNNING" : b.result || "—"}
                            </span>
                          </div>
                          <div>耗时 {formatDurationMs(b.durationMs)}</div>
                          <div className="flex gap-2 pt-1">
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => onSelect(b.number)}
                            >
                              控制台输出
                            </button>
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => onOpenChanges(b.number)}
                            >
                              修改记录
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryTable({
  rows,
  selectedNumber,
  loading,
  error,
  onSelect,
}: {
  rows: JenkinsBuildSummary[];
  selectedNumber: number | null;
  loading?: boolean;
  error?: string | null;
  onSelect: (n: number) => void;
}) {
  if (error) {
    return <p className="px-4 py-6 text-[12px] text-destructive">{error}</p>;
  }
  if (loading && rows.length === 0) {
    return <p className="px-4 py-6 text-[12px] text-muted-foreground">加载中…</p>;
  }
  if (rows.length === 0) {
    return <p className="px-4 py-6 text-[12px] text-muted-foreground">暂无构建记录</p>;
  }
  return (
    <div className="max-h-[320px] overflow-auto">
      <table className="w-full border-collapse text-left text-[13px]">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-border-subtle text-[11px] text-muted-foreground">
            {["构建编号", "状态", "耗时", "时间"].map((h) => (
              <th key={h} className="h-8 px-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const selected = b.number === selectedNumber;
            return (
              <tr
                key={b.id}
                className={cn(
                  "h-9 cursor-pointer border-b border-border-subtle/70 hover:bg-surface-hover",
                  b.building && "bg-amber-50",
                  selected && "bg-primary/5",
                )}
                onClick={() => onSelect(b.number)}
              >
                <td className="px-3">
                  <span className="font-mono text-[12px] font-medium text-primary">
                    #{b.number}
                  </span>
                </td>
                <td className="px-3">
                  <StatusDot
                    label={b.building ? "RUNNING" : b.result}
                    tone={buildTone(b.building ? "RUNNING" : b.result)}
                  />
                </td>
                <td className="px-3 text-muted-foreground">{formatDurationMs(b.durationMs)}</td>
                <td className="px-3 text-muted-foreground">{formatBuildTime(b.timestamp)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

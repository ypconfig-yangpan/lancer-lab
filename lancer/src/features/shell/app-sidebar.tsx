import {
  Boxes,
  ChevronDown,
  ChevronRight,
  Container,
  FolderOpen,
  Hammer,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Settings2,
} from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShellFacade } from "@/app/facades/shell-facade-provider";
import { useDockerUiStore } from "@/capabilities/docker/mock/docker-ui-store";
import { useJenkinsUiStore } from "@/capabilities/jenkins/mock/jenkins-ui-store";
import { useK8sUiStore } from "@/capabilities/kubernetes/mock/k8s-ui-store";
import { useActivities } from "@/shell";
import { cn } from "@/shared/lib/utils";
import { useTabsStore } from "@/shared/stores/tabs-store";
import { type ThemeMode, useWorkspaceStore } from "@/shared/stores/workspace-store";

const iconMap: Record<string, ComponentType<{ className?: string; strokeWidth?: number }>> = {
  boxes: Boxes,
  container: Container,
  hammer: Hammer,
  key: KeyRound,
};

const SIDEBAR_MODULES = ["credentials", "kubernetes", "docker", "jenkins"] as const;

type SubItem = {
  id: string;
  label: string;
  action?: "dashboard" | "detail-hint";
  disabled?: boolean;
};

const SUBMENUS: Record<(typeof SIDEBAR_MODULES)[number], SubItem[]> = {
  credentials: [],
  kubernetes: [
    { id: "cluster", label: "集群", action: "dashboard" },
    { id: "workloads", label: "工作负载", action: "dashboard" },
    { id: "services", label: "服务", disabled: true },
    { id: "ingress", label: "Ingress", disabled: true },
    { id: "config", label: "配置", disabled: true },
    { id: "storage", label: "存储", disabled: true },
    { id: "logs", label: "日志", action: "dashboard" },
    { id: "events", label: "事件", disabled: true },
  ],
  docker: [
    { id: "containers", label: "容器", action: "dashboard" },
    { id: "images", label: "镜像", disabled: true },
    { id: "volumes", label: "卷", disabled: true },
    { id: "networks", label: "网络", disabled: true },
  ],
  jenkins: [
    { id: "jobs", label: "状态", action: "dashboard" },
    { id: "views", label: "视图", disabled: true },
    { id: "history", label: "构建历史", action: "dashboard" },
    { id: "nodes", label: "节点", disabled: true },
  ],
};

const PLACEHOLDER_TOP: {
  id: string;
  label: string;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [{ id: "workbench", label: "工作台", Icon: LayoutDashboard }];

const PLACEHOLDER_BOTTOM: {
  id: string;
  label: string;
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  { id: "hosts", label: "主机", Icon: HardDrive },
  { id: "files", label: "文件", Icon: FolderOpen },
];

/**
 * Narrow product sidebar — three tools with expandable submenus (design mock).
 */
export function AppSidebar() {
  const { t } = useTranslation();
  const activities = useActivities();
  const activeActivityId = useWorkspaceStore((s) => s.activeActivityId);
  const setActiveActivityId = useWorkspaceStore((s) => s.setActiveActivityId);
  const openWorkspaceTab = useTabsStore((s) => s.openWorkspaceTab);
  const shell = useShellFacade();

  const k8sOpenDashboard = useK8sUiStore((s) => s.openDashboard);
  const dockerOpenDashboard = useDockerUiStore((s) => s.openDashboard);
  const jenkinsOpenDashboard = useJenkinsUiStore((s) => s.openDashboard);

  const [activeSubByModule, setActiveSubByModule] = useState<Record<string, string>>({
    kubernetes: "workloads",
    docker: "containers",
    jenkins: "jobs",
  });

  const sortedActivities = useMemo(() => {
    const allow = new Set<string>(SIDEBAR_MODULES);
    const list = activities.filter((a) => allow.has(a.moduleId));
    list.sort((a, b) => {
      const ai = (SIDEBAR_MODULES as readonly string[]).indexOf(a.moduleId);
      const bi = (SIDEBAR_MODULES as readonly string[]).indexOf(b.moduleId);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
    return list;
  }, [activities]);

  const openActivity = (activityId: string, moduleId: string) => {
    setActiveActivityId(activityId);
    const primary = shell.platform.views
      .listByLocation("workspace")
      .find((v) => v.moduleId === moduleId);
    if (primary) {
      openWorkspaceTab(
        {
          id: `${moduleId}:${primary.id}`,
          viewId: primary.id,
          moduleId,
          title: primary.title,
        },
        "pinned",
      );
    }
    if (moduleId === "kubernetes") k8sOpenDashboard();
    if (moduleId === "docker") dockerOpenDashboard();
    if (moduleId === "jenkins") jenkinsOpenDashboard();
  };

  const onSubClick = (moduleId: string, item: SubItem, activityId: string) => {
    if (item.disabled) return;
    openActivity(activityId, moduleId);
    setActiveSubByModule((prev) => ({ ...prev, [moduleId]: item.id }));

    if (moduleId === "kubernetes") {
      k8sOpenDashboard();
    } else if (moduleId === "docker") {
      dockerOpenDashboard();
    } else if (moduleId === "jenkins") {
      jenkinsOpenDashboard(item.id === "history" ? "history" : "jobs");
    }
  };

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-border-subtle bg-white">
      <div className="flex h-12 shrink-0 items-center px-4">
        <div className="text-[16px] font-bold tracking-tight text-primary">Lancer</div>
      </div>

      <nav className="min-h-0 flex-1 overflow-auto px-2 py-2" aria-label={t("nav.activityBar")}>
        <ul className="space-y-0.5">
          {PLACEHOLDER_TOP.map((item) => (
            <li key={item.id}>
              <div className="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-3 text-[13px] text-slate-400">
                <item.Icon className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{item.label}</span>
                <span className="ml-auto text-[10px] text-slate-300">即将</span>
              </div>
            </li>
          ))}

          {sortedActivities.map((activity) => {
            const Icon = (activity.icon && iconMap[activity.icon]) || Boxes;
            const active = activity.id === activeActivityId;
            const moduleId = activity.moduleId as (typeof SIDEBAR_MODULES)[number];
            const subs = SUBMENUS[moduleId] ?? [];
            const activeSub = activeSubByModule[moduleId];

            return (
              <li key={activity.id}>
                <button
                  type="button"
                  aria-expanded={active}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-[8px] px-2.5 text-left text-[13px] transition-colors",
                    active
                      ? "bg-primary/10 font-semibold text-primary"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  )}
                  onClick={() => openActivity(activity.id, activity.moduleId)}
                >
                  {active ? (
                    <ChevronDown className="size-3.5 shrink-0 text-slate-400" strokeWidth={1.75} />
                  ) : (
                    <ChevronRight className="size-3.5 shrink-0 text-slate-400" strokeWidth={1.75} />
                  )}
                  <Icon
                    className={cn("size-4 shrink-0", active ? "text-primary" : "text-slate-500")}
                    strokeWidth={1.75}
                  />
                  <span className="truncate">{activity.title}</span>
                </button>

                {active ? (
                  <ul className="mt-0.5 space-y-0.5 pl-7">
                    {subs.map((sub) => {
                      const subActive = !sub.disabled && activeSub === sub.id;
                      return (
                        <li key={sub.id}>
                          <button
                            type="button"
                            disabled={sub.disabled}
                            title={sub.disabled ? "即将支持" : undefined}
                            className={cn(
                              "flex h-8 w-full items-center rounded-[6px] px-2.5 text-left text-[12px] transition-colors",
                              sub.disabled && "cursor-not-allowed text-slate-400",
                              !sub.disabled &&
                                subActive &&
                                "bg-primary/10 font-medium text-primary",
                              !sub.disabled &&
                                !subActive &&
                                "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                            )}
                            onClick={() => onSubClick(moduleId, sub, activity.id)}
                          >
                            <span className="truncate">{sub.label}</span>
                            {sub.disabled ? (
                              <span className="ml-auto text-[9px] text-slate-300">即将</span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}

          {PLACEHOLDER_BOTTOM.map((item) => (
            <li key={item.id}>
              <div className="flex h-9 w-full items-center gap-2.5 rounded-[8px] px-3 text-[13px] text-slate-400">
                <item.Icon className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="truncate">{item.label}</span>
                <span className="ml-auto text-[10px] text-slate-300">即将</span>
              </div>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-border-subtle p-2">
        <SettingsGear />
      </div>
    </aside>
  );
}

function SettingsGear() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [logDir, setLogDir] = useState<string | null>(null);
  const theme = useWorkspaceStore((s) => s.theme);
  const setTheme = useWorkspaceStore((s) => s.setTheme);
  const modules = useShellFacade().listModules();

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const { invokeCommand } = await import("@/shared/tauri");
        const health = await invokeCommand<{ logDir?: string }>("app_health");
        setLogDir(health.logDir ?? null);
      } catch {
        setLogDir(null);
      }
    })();
  }, [open]);

  const openLogDir = async () => {
    if (!logDir) return;
    try {
      const { openPath } = await import("@tauri-apps/plugin-opener");
      await openPath(logDir);
    } catch {
      // ignore — opener may be unavailable in some hosts
    }
  };

  const quitApp = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("app_prepare_shutdown");
      await invoke("app_request_exit");
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="flex h-10 w-full items-center gap-2.5 rounded-[8px] px-3 text-[13px] text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        onClick={() => setOpen((v) => !v)}
      >
        <Settings2 className="size-4 text-slate-500" strokeWidth={1.75} />
        {t("nav.settings")}
      </button>
      {open ? (
        <div className="absolute bottom-12 left-2 z-50 w-52 rounded-[8px] border border-border bg-white p-3 shadow-lg">
          <div className="mb-2 text-[12px] font-semibold">{t("settings.theme.title")}</div>
          <div className="mb-2 flex flex-col gap-1">
            {(["system", "dark", "light"] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={cn(
                  "rounded-[6px] px-2 py-1.5 text-left text-[12px] hover:bg-surface-hover",
                  theme === mode && "bg-primary/10 text-primary",
                )}
                onClick={() => setTheme(mode)}
              >
                {t(`settings.theme.${mode}`)}
              </button>
            ))}
          </div>
          <div className="mb-1 text-[12px] font-semibold">{t("settings.modules.title")}</div>
          <ul className="mb-2 space-y-0.5 text-[11px] text-muted-foreground">
            {modules.map((m) => (
              <li key={m.id} className="truncate px-1">
                {m.name}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="w-full rounded-[6px] px-2 py-1.5 text-left text-[12px] text-slate-700 hover:bg-surface-hover disabled:opacity-40"
            disabled={!logDir}
            onClick={() => void openLogDir()}
          >
            打开应用日志目录
          </button>
          <button
            type="button"
            className="mt-1 w-full rounded-[6px] px-2 py-1.5 text-left text-[12px] text-destructive hover:bg-surface-hover"
            onClick={() => void quitApp()}
          >
            退出 Lancer
          </button>
        </div>
      ) : null}
    </div>
  );
}

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SquareX,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CompactSelect } from "@/components/ui/compact-select";
import type { LogLevel, LogLine } from "@/entities/log/types";
import { formatInstant } from "@/shared/lib/datetime";
import { cn } from "@/shared/lib/utils";

const UI_BUFFER_LIMIT = 20_000;
const LINE_LIMITS = [500, 2_000, 5_000, 10_000] as const;

interface LogViewerProps {
  lines: LogLine[];
  onPausedChange?: (paused: boolean) => void;
  variant?: "default" | "terminal";
  /** Shown in terminal chrome header (e.g. service / pod picker). */
  toolbarStart?: ReactNode;
  title?: string;
  /** Homepage: start collapsed to header-only strip. */
  defaultCollapsed?: boolean;
  /** Show collapse chevron (dock widget usually hides it). */
  enableCollapse?: boolean;
  /** Show fullscreen control (terminal variant). */
  enableFullscreen?: boolean;
  /** Height when expanded (non-fullscreen). */
  expandedClassName?: string;
  /** Dock widget: denser toolbar. */
  density?: "comfortable" | "dock";
  /** Extra status on the right (e.g. cluster live · cached N). */
  statusHint?: string;
}

/** Soft highlight for HTTP tokens / key:value — design-draft polish. */
function highlightMessage(message: string): ReactNode {
  const re =
    /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|\b([1-5]\d{2})\b|\b(\d+ms)\b|\b([a-zA-Z_][\w.-]*:\d+)\b/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(message)) !== null) {
    if (m.index > last) {
      nodes.push(message.slice(last, m.index));
    }
    const token = m[0];
    let cls = "text-[#7dd3fc]";
    if (m[4]) cls = "text-[#a3e635]";
    nodes.push(
      <span key={key++} className={cls}>
        {token}
      </span>,
    );
    last = m.index + token.length;
  }
  if (last < message.length) {
    nodes.push(message.slice(last));
  }
  return nodes.length === 0 ? message : <Fragment>{nodes}</Fragment>;
}

export function LogViewer({
  lines,
  onPausedChange,
  variant = "default",
  toolbarStart,
  title = "实时日志",
  defaultCollapsed = false,
  enableCollapse = true,
  enableFullscreen = true,
  expandedClassName = "h-[min(420px,44vh)]",
  density = "comfortable",
  statusHint,
}: LogViewerProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [paused, setPaused] = useState(false);
  const [followTail, setFollowTail] = useState(true);
  const [levelFilter, setLevelFilter] = useState<LogLevel | "ALL">("ALL");
  const [keyword, setKeyword] = useState("");
  const [lineLimit, setLineLimit] = useState<(typeof LINE_LIMITS)[number]>(2_000);
  const [clearedAt, setClearedAt] = useState(0);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [fullscreen, setFullscreen] = useState(false);
  const terminal = variant === "terminal";

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const bounded = useMemo(() => {
    const afterClear = clearedAt > 0 ? lines.filter((l) => l.lineNumber > clearedAt) : lines;
    const capped =
      afterClear.length <= UI_BUFFER_LIMIT
        ? afterClear
        : afterClear.slice(afterClear.length - UI_BUFFER_LIMIT);
    if (terminal) {
      return capped.length <= lineLimit ? capped : capped.slice(capped.length - lineLimit);
    }
    return capped;
  }, [clearedAt, lineLimit, lines, terminal]);

  const filtered = useMemo(() => {
    return bounded.filter((line) => {
      if (levelFilter !== "ALL" && line.level !== levelFilter) {
        return false;
      }
      if (keyword && !line.message.toLowerCase().includes(keyword.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [bounded, keyword, levelFilter]);

  const showBody = !collapsed || fullscreen;

  // Terminal: plain list so long lines can scroll horizontally.
  // Classic viewer keeps virtualization.
  const virtualizer = useVirtualizer({
    count: terminal ? 0 : filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 24,
  });

  useEffect(() => {
    if (!followTail || filtered.length === 0 || !showBody) {
      return;
    }
    if (terminal) {
      const el = parentRef.current;
      if (el) el.scrollTop = el.scrollHeight;
      return;
    }
    virtualizer.scrollToIndex(filtered.length - 1, { align: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, followTail, showBody, terminal]);

  const levelBadge = (level: LogLevel) => {
    if (level === "ERROR") return "text-[#f87171]";
    if (level === "WARN") return "text-[#fb923c]";
    if (level === "INFO") return "text-[#e5e7eb]";
    if (level === "DEBUG") return "text-[#64748b]";
    return "text-[#cbd5e1]";
  };

  const levelClass = (level: LogLevel): string => {
    if (terminal) return levelBadge(level);
    if (level === "ERROR") return "log-viewer__row--error";
    if (level === "WARN") return "log-viewer__row--warning";
    if (level === "INFO") return "log-viewer__row--info";
    return "";
  };

  const togglePause = () => {
    setPaused((value) => {
      const next = !value;
      onPausedChange?.(next);
      return next;
    });
  };

  const clearLocal = () => {
    const last = lines[lines.length - 1];
    setClearedAt(last?.lineNumber ?? Number.MAX_SAFE_INTEGER);
    setFollowTail(true);
  };

  const downloadLogs = () => {
    const text = filtered
      .map(
        (l) =>
          `${formatInstant(l.timestamp, "yyyy-MM-dd HH:mm:ss")}  [${l.level}]  ${l.message}`,
      )
      .join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lancer-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onWheelCapture = (event: WheelEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  const iconBtn = (active?: boolean) =>
    cn(
      "inline-flex size-7 items-center justify-center rounded-[6px] transition-colors",
      active
        ? "bg-primary/15 text-primary"
        : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground",
    );

  if (terminal) {
    const panel = (
      <div
        className={cn(
          "flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-border-subtle bg-white",
          density === "dock"
            ? "shadow-[0_8px_28px_rgba(15,23,42,0.14)]"
            : "shadow-[0_1px_2px_rgba(0,0,0,0.04)]",
          fullscreen ? "h-full" : collapsed ? "h-10" : expandedClassName,
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 border-b border-border-subtle px-2.5",
            density === "dock" ? "h-9 flex-wrap py-1" : "h-10 gap-2 px-3",
          )}
        >
          <span className="shrink-0 text-[13px] font-semibold text-foreground">{title}</span>
          {toolbarStart}
          {fullscreen ? (
            <CompactSelect
              value={lineLimit}
              onChange={(e) =>
                setLineLimit(Number(e.target.value) as (typeof LINE_LIMITS)[number])
              }
              title="Lines"
              triggerClassName="w-[76px]"
            >
              {LINE_LIMITS.map((n) => (
                <option key={n} value={n}>
                  {n} 行
                </option>
              ))}
            </CompactSelect>
          ) : null}
          <button
            type="button"
            className={iconBtn(paused)}
            onClick={togglePause}
            title={paused ? t("logs.resume") : t("logs.pause")}
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
          <button type="button" className={iconBtn()} onClick={clearLocal} title="清空">
            <SquareX className="size-3.5" />
          </button>
          <button type="button" className={iconBtn()} onClick={downloadLogs} title="下载">
            <Download className="size-3.5" />
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            {fullscreen && statusHint ? (
              <span
                className="hidden max-w-[220px] truncate text-[10px] text-muted-foreground sm:inline"
                title={statusHint}
              >
                {statusHint}
              </span>
            ) : null}
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {filtered.length} 行
            </span>            {enableCollapse && !fullscreen ? (
              <button
                type="button"
                className={iconBtn()}
                onClick={() => setCollapsed((v) => !v)}
                title={collapsed ? "展开" : "收起"}
              >
                {collapsed ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronUp className="size-3.5" />
                )}
              </button>
            ) : null}
            {enableFullscreen ? (
              <button
                type="button"
                className={iconBtn(fullscreen)}
                onClick={() => {
                  setFullscreen((v) => !v);
                  if (!fullscreen) setCollapsed(false);
                }}
                title={fullscreen ? "退出全屏 (Esc)" : "全屏"}
              >
                {fullscreen ? (
                  <Minimize2 className="size-3.5" />
                ) : (
                  <Maximize2 className="size-3.5" />
                )}
              </button>
            ) : null}
          </div>
        </div>

        {showBody ? (
          <div className={cn("min-h-0 flex-1", density === "dock" && !fullscreen ? "p-2" : "p-3")}>
            <div
              ref={parentRef}
              className="h-full min-h-0 overflow-auto overscroll-contain rounded-[8px] bg-[#0b0f14] px-3 py-2.5 font-mono text-[12px] leading-6 text-[#e5e7eb]"
              onWheelCapture={onWheelCapture}
              onScroll={() => {
                const el = parentRef.current;
                if (!el || !followTail) {
                  return;
                }
                const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
                if (!nearBottom) {
                  setFollowTail(false);
                }
              }}
            >
              {filtered.length === 0 ? (
                <div className="flex h-full min-w-full items-center justify-center text-[#64748b]">
                  —
                </div>
              ) : (
                <div className="w-max min-w-full">
                  {filtered.map((line) => (
                    <div
                      key={line.id}
                      className="flex items-start gap-2.5 whitespace-pre"
                    >
                      <span className="w-[148px] shrink-0 tabular-nums text-[#94a3b8]">
                        {formatInstant(line.timestamp, "yyyy-MM-dd HH:mm:ss")}
                      </span>
                      <span
                        className={cn(
                          "w-[64px] shrink-0 font-semibold",
                          levelBadge(line.level),
                        )}
                      >
                        [{line.level}]
                      </span>
                      <span className="text-[#e2e8f0]">{highlightMessage(line.message)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );

    if (fullscreen) {
      return createPortal(
        <div className="fixed inset-0 z-[80] flex flex-col bg-[#0b0f14]/10 p-4 backdrop-blur-[2px]">
          <div className="mx-auto h-full w-full max-w-[1400px]">{panel}</div>
        </div>,
        document.body,
      );
    }

    return panel;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-panel-border px-3 py-2">
        <Button variant={paused ? "secondary" : "outline"} size="sm" onClick={togglePause}>
          {paused ? t("logs.resume") : t("logs.pause")}
        </Button>
        <Button
          variant={followTail ? "secondary" : "outline"}
          size="sm"
          onClick={() => setFollowTail((value) => !value)}
        >
          {t("logs.followTail")}
        </Button>
        <select
          className="h-7 rounded-md border border-border bg-panel px-2 text-xs"
          value={levelFilter}
          onChange={(event) => setLevelFilter(event.target.value as LogLevel | "ALL")}
        >
          <option value="ALL">{t("logs.allLevels")}</option>
          <option value="ERROR">ERROR</option>
          <option value="WARN">WARN</option>
          <option value="INFO">INFO</option>
          <option value="DEBUG">DEBUG</option>
        </select>
        <input
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-panel px-2 text-xs"
          placeholder={t("logs.keywordPlaceholder")}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <span className="text-[11px] text-muted-foreground">
          {t("logs.buffer", { shown: filtered.length, total: lines.length })}
        </span>
      </div>

      <div
        ref={parentRef}
        className="log-viewer min-h-0 flex-1 overflow-y-auto overscroll-contain"
        onWheelCapture={onWheelCapture}
        onScroll={() => {
          const el = parentRef.current;
          if (!el || !followTail) {
            return;
          }
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          if (!nearBottom) {
            setFollowTail(false);
          }
        }}
      >
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
            —
          </div>
        ) : (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const line = filtered[virtualRow.index];
              if (!line) {
                return null;
              }
              return (
                <div
                  key={line.id}
                  className={cn(
                    "absolute left-0 top-0 flex w-full items-start gap-2.5 whitespace-pre px-3 text-[12px]",
                    levelClass(line.level),
                  )}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <span className="w-14 shrink-0 text-muted-foreground">{line.lineNumber}</span>
                  <span className="w-40 shrink-0 text-muted-foreground">
                    {formatInstant(line.timestamp, "HH:mm:ss.SSS")}
                  </span>
                  <span className="w-14 shrink-0">{line.level}</span>
                  <span className="min-w-0 flex-1 truncate">{line.message}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Search,
  SquareX,
  X,
} from "lucide-react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type WheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { kubernetesApi } from "@/capabilities/kubernetes/api";
import { Button } from "@/components/ui/button";
import { CompactSelect } from "@/components/ui/compact-select";
import type { LogLevel, LogLine } from "@/entities/log/types";
import type { NativeLogSearchMatch } from "@/native/types";
import { formatInstant } from "@/shared/lib/datetime";
import { cn } from "@/shared/lib/utils";

const UI_BUFFER_LIMIT = 20_000;
const LINE_LIMITS = [500, 2_000, 5_000, 10_000] as const;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE = 200;

type SearchUiStatus = "idle" | "searching" | "ready" | "cancelled" | "error";

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
  /** Managed-log session for full-file Search IPC. */
  sessionId?: string | null;
  /** Seek read window to line (1-based) when match is outside buffer. */
  onSeekToLine?: (lineNumber: number) => void;
  /** Flat source label for Copy Context (pod/container). */
  sourceLabel?: string;
  /** Stream status from managed-log session (following / error / open…). */
  streamStatus?: string | null;
  /** Re-open follow without clearing the visible buffer. */
  onReconnect?: () => void;
  /** Session total lines (for Jump to Line clamp). */
  totalLines?: number;
  /** Jump to timestamp (ISO or HH:mm[:ss]); returns found line or null. */
  onJumpToTime?: (target: string) => Promise<number | null>;
  /** Disk window has earlier lines — show Load older. */
  canLoadOlder?: boolean;
  onLoadOlder?: () => void;
  /** Leave history browse / seek and pin to live tail. */
  onPinLiveTail?: () => void;
  historyBrowsing?: boolean;
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

function highlightSearchInMessage(
  message: string,
  query: string,
  isCurrent: boolean,
): ReactNode {
  if (!query) return highlightMessage(message);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let re: RegExp;
  try {
    re = new RegExp(escaped, "gi");
  } catch {
    return highlightMessage(message);
  }
  const nodes: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(message)) !== null) {
    if (m.index > last) nodes.push(message.slice(last, m.index));
    nodes.push(
      <mark
        key={key++}
        className={cn(
          "rounded-[2px] px-0.5",
          isCurrent ? "bg-[#fbbf24]/55 text-[#0b0f14]" : "bg-[#64748b]/45 text-[#e2e8f0]",
        )}
      >
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < message.length) nodes.push(message.slice(last));
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
  sessionId = null,
  onSeekToLine,
  sourceLabel,
  streamStatus = null,
  onReconnect,
  totalLines,
  onJumpToTime,
  canLoadOlder = false,
  onLoadOlder,
  onPinLiveTail,
  historyBrowsing = false,
}: LogViewerProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const jumpInputRef = useRef<HTMLInputElement | null>(null);
  const unfollowAtLineRef = useRef<number | null>(null);
  const searchGenRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [followTail, setFollowTail] = useState(true);
  const [newLineCount, setNewLineCount] = useState(0);
  const [levelFilter, setLevelFilter] = useState<LogLevel | "ALL">("ALL");
  const [keyword, setKeyword] = useState("");
  const [lineLimit, setLineLimit] = useState<(typeof LINE_LIMITS)[number]>(2_000);
  const [clearedAt, setClearedAt] = useState(0);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [fullscreen, setFullscreen] = useState(false);
  const terminal = variant === "terminal";

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchRegex, setSearchRegex] = useState(false);
  const [searchCase, setSearchCase] = useState(false);
  const [searchStatus, setSearchStatus] = useState<SearchUiStatus>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [matches, setMatches] = useState<NativeLogSearchMatch[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [hasMoreMatches, setHasMoreMatches] = useState(false);
  const [nextCursorByte, setNextCursorByte] = useState<number | null>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpMode, setJumpMode] = useState<"line" | "time">("line");
  const [jumpInput, setJumpInput] = useState("");
  const [jumpError, setJumpError] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const resetSearch = useCallback(() => {
    searchGenRef.current += 1;
    setSearchQuery("");
    setSearchStatus("idle");
    setSearchError(null);
    setMatches([]);
    setMatchIndex(0);
    setHasMoreMatches(false);
    setNextCursorByte(null);
    if (sessionId) {
      void kubernetesApi.cancelLogSearch(sessionId);
    }
  }, [sessionId]);

  useEffect(() => {
    resetSearch();
    setSearchOpen(false);
  }, [sessionId, resetSearch]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !searchOpen) setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen, searchOpen]);

  useEffect(() => {
    if (!terminal) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && !e.shiftKey) {
        e.preventDefault();
        setJumpOpen(false);
        setSearchOpen(true);
        setCollapsed(false);
        queueMicrotask(() => searchInputRef.current?.focus());
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "l") {
        e.preventDefault();
        setSearchOpen(false);
        setJumpOpen(true);
        setJumpMode("line");
        setJumpError(null);
        setCollapsed(false);
        queueMicrotask(() => jumpInputRef.current?.focus());
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setFullscreen((v) => !v);
        setCollapsed(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [terminal]);

  useEffect(() => {
    if (streamStatus === "following" || streamStatus === "paused") {
      setReconnecting(false);
    }
  }, [streamStatus]);

  const submitJump = async () => {
    const raw = jumpInput.trim();
    if (!raw) return;
    setJumpError(null);
    if (jumpMode === "line") {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1) {
        setJumpError("Enter a line number ≥ 1");
        return;
      }
      const max = totalLines && totalLines > 0 ? totalLines : n;
      const clamped = Math.min(Math.floor(n), max);
      setFollowFlow(false);
      onSeekToLine?.(clamped);
      setJumpOpen(false);
      return;
    }
    if (!onJumpToTime) {
      setJumpError("Time jump unavailable");
      return;
    }
    try {
      const line = await onJumpToTime(raw);
      if (line === null) {
        setJumpError("No log line at or after that time");
        return;
      }
      setFollowFlow(false);
      onSeekToLine?.(line);
      setJumpOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setJumpError(
        /timestamp/i.test(msg)
          ? "No timestamps available for time jump"
          : "Unable to jump to time",
      );
    }
  };

  const setFollowFlow = (follow: boolean) => {
    if (follow) {
      setFollowTail(true);
      setNewLineCount(0);
      unfollowAtLineRef.current = null;
    } else {
      setFollowTail(false);
    }
  };

  const bounded = useMemo(() => {
    const afterClear = clearedAt > 0 ? lines.filter((l) => l.lineNumber > clearedAt) : lines;
    const capped =
      afterClear.length <= UI_BUFFER_LIMIT
        ? afterClear
        : afterClear.slice(afterClear.length - UI_BUFFER_LIMIT);
    // Search mode: keep full data window so matches are not clipped by lineLimit.
    if (terminal && !searchOpen) {
      return capped.length <= lineLimit ? capped : capped.slice(capped.length - lineLimit);
    }
    return capped;
  }, [clearedAt, lineLimit, lines, terminal, searchOpen]);

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

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 24,
  });

  useEffect(() => {
    if (followTail) {
      unfollowAtLineRef.current = null;
      setNewLineCount(0);
      return;
    }
    const lastNum = lines[lines.length - 1]?.lineNumber ?? 0;
    if (unfollowAtLineRef.current === null) {
      unfollowAtLineRef.current = lastNum;
      setNewLineCount(0);
      return;
    }
    setNewLineCount(Math.max(0, lastNum - unfollowAtLineRef.current));
  }, [followTail, lines]);

  useEffect(() => {
    if (!followTail || filtered.length === 0 || !showBody || searchOpen) {
      return;
    }
    virtualizer.scrollToIndex(filtered.length - 1, { align: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, followTail, showBody, searchOpen]);

  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const onSeekRef = useRef(onSeekToLine);
  onSeekRef.current = onSeekToLine;
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const pendingFocusLineRef = useRef<number | null>(null);

  const focusMatch = useCallback((match: NativeLogSearchMatch | undefined) => {
    if (!match) return;
    setFollowTail(false);
    const idx = filteredRef.current.findIndex((l) => l.lineNumber === match.lineNumber);
    if (idx >= 0) {
      pendingFocusLineRef.current = null;
      virtualizerRef.current.scrollToIndex(idx, { align: "center" });
      return;
    }
    // Match outside current data window → seek read window, then scroll when lines arrive.
    pendingFocusLineRef.current = match.lineNumber;
    onSeekRef.current?.(match.lineNumber);
  }, []);

  // After seek / window update, center the pending (or current) match.
  useEffect(() => {
    if (!searchOpen) return;
    const target =
      pendingFocusLineRef.current ?? matches[matchIndex]?.lineNumber ?? null;
    if (target === null) return;
    const idx = filtered.findIndex((l) => l.lineNumber === target);
    if (idx < 0) return;
    pendingFocusLineRef.current = null;
    virtualizer.scrollToIndex(idx, { align: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, matchIndex, matches, searchOpen]);

  // Stable search: only re-run when query/options/session change — NOT on every Follow poll.
  useEffect(() => {
    if (!terminal || !searchOpen) return;
    if (!sessionId) {
      setSearchStatus("error");
      setSearchError("No log session");
      setMatches([]);
      return;
    }
    const q = searchQuery.trim();
    if (!q) {
      setMatches([]);
      setMatchIndex(0);
      setHasMoreMatches(false);
      setNextCursorByte(null);
      setSearchStatus("idle");
      setSearchError(null);
      void kubernetesApi.cancelLogSearch(sessionId);
      return;
    }

    const gen = ++searchGenRef.current;
    setSearchStatus("searching");
    setSearchError(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await kubernetesApi.searchLogs({
            sessionId,
            pattern: q,
            regex: searchRegex,
            caseSensitive: searchCase,
            maxMatches: SEARCH_PAGE,
            cursorByte: 0,
          });
          if (gen !== searchGenRef.current) return;
          setMatches(result.matches);
          setMatchIndex(0);
          setHasMoreMatches(result.hasMore);
          setNextCursorByte(result.nextCursorByte);
          setSearchStatus("ready");
          if (result.matches[0]) {
            focusMatch(result.matches[0]);
          }
        } catch (err: unknown) {
          if (gen !== searchGenRef.current) return;
          const msg = err instanceof Error ? err.message : String(err);
          setSearchStatus("error");
          setSearchError(
            /invalid|regex/i.test(msg)
              ? "Invalid regular expression"
              : "Unable to search this log",
          );
          setMatches([]);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [terminal, searchOpen, sessionId, searchQuery, searchRegex, searchCase, focusMatch]);

  const loadMoreMatches = useCallback(async (): Promise<NativeLogSearchMatch[]> => {
    if (!sessionId || nextCursorByte === null || !hasMoreMatches) return [];
    const q = searchQuery.trim();
    if (!q) return [];
    const gen = searchGenRef.current;
    setSearchStatus("searching");
    try {
      const result = await kubernetesApi.searchLogs({
        sessionId,
        pattern: q,
        regex: searchRegex,
        caseSensitive: searchCase,
        maxMatches: SEARCH_PAGE,
        cursorByte: nextCursorByte,
      });
      if (gen !== searchGenRef.current) return [];
      setMatches((prev) => [...prev, ...result.matches]);
      setHasMoreMatches(result.hasMore);
      setNextCursorByte(result.nextCursorByte);
      setSearchStatus("ready");
      return result.matches;
    } catch {
      if (gen !== searchGenRef.current) return [];
      setSearchStatus("error");
      setSearchError("Unable to search this log");
      return [];
    }
  }, [
    sessionId,
    nextCursorByte,
    hasMoreMatches,
    searchQuery,
    searchRegex,
    searchCase,
  ]);

  const goNextMatch = useCallback(async () => {
    if (searchStatus === "searching") return;
    if (matches.length === 0) return;
    if (matchIndex + 1 < matches.length) {
      const next = matchIndex + 1;
      setMatchIndex(next);
      focusMatch(matches[next]);
      return;
    }
    if (hasMoreMatches) {
      const added = await loadMoreMatches();
      if (added.length > 0) {
        const next = matchIndex + 1;
        setMatchIndex(next);
        focusMatch(added[0]);
      }
      return;
    }
    setMatchIndex(0);
    focusMatch(matches[0]);
  }, [
    searchStatus,
    matches,
    matchIndex,
    hasMoreMatches,
    loadMoreMatches,
    focusMatch,
  ]);

  const goPrevMatch = useCallback(() => {
    if (matches.length === 0) return;
    const prev = matchIndex <= 0 ? matches.length - 1 : matchIndex - 1;
    setMatchIndex(prev);
    focusMatch(matches[prev]);
  }, [matches, matchIndex, focusMatch]);

  const closeSearch = () => {
    setSearchOpen(false);
    resetSearch();
  };

  const copyContext = () => {
    const match = matches[matchIndex];
    const centerLine = match?.lineNumber ?? filtered[Math.floor(filtered.length / 2)]?.lineNumber;
    if (centerLine === undefined) return;
    const before = 50;
    const after = 50;
    const slice = filtered.filter(
      (l) => l.lineNumber >= centerLine - before && l.lineNumber <= centerLine + after,
    );
    const header = [
      sourceLabel ? `Source: ${sourceLabel}` : null,
      match ? `Match line: ${match.lineNumber}` : null,
      searchQuery ? `Query: ${searchQuery}` : null,
      "",
    ]
      .filter((x) => x !== null)
      .join("\n");
    const body = slice
      .map(
        (l) =>
          `${formatInstant(l.timestamp, "yyyy-MM-dd HH:mm:ss")}  [${l.level}]  ${l.message}`,
      )
      .join("\n");
    void navigator.clipboard.writeText(`${header}${body}`);
  };

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
    // View-only: hide lines ≤ clearedAt. Disk / session untouched.
    const last = lines[lines.length - 1];
    setClearedAt(last?.lineNumber ?? Number.MAX_SAFE_INTEGER);
    setFollowTail(true);
    setNewLineCount(0);
    unfollowAtLineRef.current = null;
  };

  const restoreCleared = () => {
    setClearedAt(0);
  };

  const jumpToLatest = () => {
    setFollowFlow(true);
    onPinLiveTail?.();
    onSeekToLine?.(0);
  };

  // Previous dumps end as status=open — not an interrupt. Only error needs Reconnect.
  const showReconnectBar =
    terminal && onReconnect && streamStatus === "error" && !reconnecting;

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

  const updateFollowFromScroll = () => {
    const el = parentRef.current;
    if (!el || !followTail) {
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    if (!nearBottom) {
      setFollowTail(false);
    }
  };

  const iconBtn = (active?: boolean) =>
    cn(
      "inline-flex size-7 items-center justify-center rounded-[6px] transition-colors",
      active
        ? "bg-primary/15 text-primary"
        : "text-muted-foreground hover:bg-black/[0.04] hover:text-foreground",
    );

  const matchCountLabel = (() => {
    if (searchStatus === "searching") return "Searching...";
    if (searchStatus === "error") return searchError ?? "Unable to search this log";
    if (searchStatus === "cancelled") return "Search cancelled";
    if (!searchQuery.trim()) return "";
    if (matches.length === 0) return "No matches";
    const cur = matchIndex + 1;
    const total = hasMoreMatches ? `${matches.length}+` : String(matches.length);
    return `${cur} / ${total}`;
  })();

  const currentMatchLine = matches[matchIndex]?.lineNumber;

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        goPrevMatch();
      } else {
        void goNextMatch();
      }
    }
  };

  if (terminal) {
    const showNewLinesBadge = !followTail && newLineCount > 0;
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
          <CompactSelect
            value={lineLimit}
            onChange={(e) =>
              setLineLimit(Number(e.target.value) as (typeof LINE_LIMITS)[number])
            }
            title="视口最多渲染行数（不删磁盘；搜索时自动放开）"
            triggerClassName="w-[96px]"
          >
            {LINE_LIMITS.map((n) => (
              <option key={n} value={n}>
                视口 {n}
              </option>
            ))}
          </CompactSelect>
          <button
            type="button"
            className={iconBtn(searchOpen)}
            onClick={() => {
              setJumpOpen(false);
              setSearchOpen(true);
              setCollapsed(false);
              queueMicrotask(() => searchInputRef.current?.focus());
            }}
            title="Search (⌘F)"
          >
            <Search className="size-3.5" />
          </button>
          <button
            type="button"
            className={iconBtn(jumpOpen)}
            onClick={() => {
              setSearchOpen(false);
              setJumpOpen(true);
              setJumpError(null);
              setCollapsed(false);
              queueMicrotask(() => jumpInputRef.current?.focus());
            }}
            title="Jump (⌘L)"
          >
            <span className="text-[10px] font-semibold tabular-nums">#</span>
          </button>
          <button
            type="button"
            className={iconBtn(paused)}
            onClick={togglePause}
            title={paused ? t("logs.resume") : t("logs.pause")}
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </button>
          {clearedAt > 0 ? (
            <button
              type="button"
              className={iconBtn(true)}
              onClick={restoreCleared}
              title="恢复清空前的视口（磁盘日志一直在）"
            >
              <RotateCcw className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              className={iconBtn()}
              onClick={clearLocal}
              title="清空视口：只藏当前已显示行，不删本地缓存"
            >
              <SquareX className="size-3.5" />
            </button>
          )}
          <button type="button" className={iconBtn()} onClick={downloadLogs} title="下载">
            <Download className="size-3.5" />
          </button>
          {searchOpen || matches.length > 0 ? (
            <button
              type="button"
              className={iconBtn()}
              onClick={copyContext}
              title="Copy Context"
            >
              <Copy className="size-3.5" />
            </button>
          ) : null}

          <div className="ml-auto flex items-center gap-1.5">
            {statusHint ? (
              <span
                className="hidden max-w-[260px] truncate text-[10px] text-muted-foreground sm:inline"
                title={statusHint}
              >
                {statusHint}
              </span>
            ) : null}
            <span
              className="text-[10px] tabular-nums text-muted-foreground"
              title={
                totalLines
                  ? `视口显示 ${filtered.length} · 磁盘共 ${totalLines}`
                  : `视口显示 ${filtered.length}`
              }
            >
              {filtered.length}
              {totalLines ? ` / ${totalLines}` : ""} 行
            </span>
            {enableCollapse && !fullscreen ? (
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

        {searchOpen && showBody ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-[#f8fafc] px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              className="h-7 min-w-0 flex-1 rounded-[6px] border border-border-subtle bg-white px-2 text-[12px] outline-none focus:border-primary/40"
              placeholder={
                sessionId
                  ? "Search message / level…"
                  : "Open a log session to search"
              }
              disabled={!sessionId}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={searchCase}
                onChange={(e) => setSearchCase(e.target.checked)}
              />
              Aa
            </label>
            <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={searchRegex}
                onChange={(e) => setSearchRegex(e.target.checked)}
              />
              .*
            </label>
            <span
              className={cn(
                "min-w-[56px] text-right text-[11px] tabular-nums",
                searchStatus === "error" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {matchCountLabel}
            </span>
            <button
              type="button"
              className={iconBtn()}
              onClick={goPrevMatch}
              title="Previous (⇧Enter)"
              disabled={matches.length === 0}
            >
              <ChevronUp className="size-3.5" />
            </button>
            <button
              type="button"
              className={iconBtn()}
              onClick={() => void goNextMatch()}
              title="Next (Enter)"
              disabled={matches.length === 0}
            >
              <ChevronDown className="size-3.5" />
            </button>
            <button type="button" className={iconBtn()} onClick={closeSearch} title="Close (Esc)">
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        {jumpOpen && showBody ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle bg-[#f8fafc] px-2.5 py-1.5">
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">Jump</span>
            <button
              type="button"
              className={cn(
                "h-6 rounded px-1.5 text-[10px]",
                jumpMode === "line" ? "bg-primary/15 text-primary" : "text-muted-foreground",
              )}
              onClick={() => {
                setJumpMode("line");
                setJumpError(null);
              }}
            >
              Line
            </button>
            <button
              type="button"
              className={cn(
                "h-6 rounded px-1.5 text-[10px]",
                jumpMode === "time" ? "bg-primary/15 text-primary" : "text-muted-foreground",
              )}
              onClick={() => {
                setJumpMode("time");
                setJumpError(null);
              }}
            >
              Time
            </button>
            <input
              ref={jumpInputRef}
              className="h-7 min-w-0 flex-1 rounded-[6px] border border-border-subtle bg-white px-2 text-[12px] outline-none focus:border-primary/40"
              placeholder={
                jumpMode === "line" ? "Line number…" : "ISO or HH:mm:ss…"
              }
              value={jumpInput}
              onChange={(e) => setJumpInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setJumpOpen(false);
                  setJumpError(null);
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitJump();
                }
              }}
            />
            {jumpError ? (
              <span className="max-w-[180px] truncate text-[10px] text-destructive" title={jumpError}>
                {jumpError}
              </span>
            ) : null}
            <button
              type="button"
              className="h-7 rounded-[6px] bg-primary px-2 text-[11px] font-medium text-primary-foreground"
              onClick={() => void submitJump()}
            >
              Go
            </button>
            <button
              type="button"
              className={iconBtn()}
              onClick={() => {
                setJumpOpen(false);
                setJumpError(null);
              }}
              title="Close"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        {showReconnectBar || reconnecting ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-amber-200/80 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950">
            <span className="min-w-0 flex-1 truncate">
              {reconnecting
                ? "Reconnecting… existing lines kept"
                : "Stream interrupted · logs kept on disk"}
            </span>
            {!reconnecting && onReconnect ? (
              <button
                type="button"
                className="shrink-0 rounded-[6px] border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-950 hover:bg-amber-100"
                onClick={() => {
                  setReconnecting(true);
                  onReconnect();
                }}
              >
                Reconnect
              </button>
            ) : null}
          </div>
        ) : null}

        {showBody ? (
          <div
            className={cn(
              "relative min-h-0 flex-1",
              density === "dock" && !fullscreen ? "p-2" : "p-3",
            )}
          >
            <div
              ref={parentRef}
              className="h-full min-h-0 overflow-auto overscroll-contain rounded-[8px] bg-[#0b0f14] px-3 py-2.5 font-mono text-[12px] leading-6 text-[#e5e7eb]"
              onWheelCapture={onWheelCapture}
              onScroll={updateFollowFromScroll}
            >
              {canLoadOlder && onLoadOlder ? (
                <div className="sticky top-0 z-[1] mb-2 flex justify-center">
                  <button
                    type="button"
                    onClick={onLoadOlder}
                    className="rounded-full border border-white/10 bg-[#1e293b]/95 px-3 py-1 text-[11px] text-[#e2e8f0] shadow-sm hover:bg-[#334155]"
                  >
                    ↑ 加载更早日志
                  </button>
                </div>
              ) : null}
              {clearedAt > 0 ? (
                <div className="mb-2 flex justify-center">
                  <button
                    type="button"
                    onClick={restoreCleared}
                    className="rounded-full border border-white/10 bg-[#334155]/80 px-3 py-1 text-[11px] text-[#cbd5e1] hover:bg-[#475569]"
                  >
                    视口已清空 · 点击恢复（磁盘未删）
                  </button>
                </div>
              ) : null}
              {filtered.length === 0 ? (
                <div className="flex h-full min-w-full items-center justify-center text-[#64748b]">
                  {clearedAt > 0 ? "视口已清空，新日志会继续显示" : "—"}
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
                    const isCurrent = currentMatchLine === line.lineNumber;
                    const isHit =
                      searchOpen &&
                      searchQuery.trim().length > 0 &&
                      matches.some((m) => m.lineNumber === line.lineNumber);
                    return (
                      <div
                        key={line.id}
                        className={cn(
                          "absolute left-0 top-0 flex w-max min-w-full items-start gap-2.5 whitespace-pre",
                          isCurrent && "bg-[#fbbf24]/12",
                          isHit && !isCurrent && "bg-white/[0.03]",
                        )}
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
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
                        <span className="text-[#e2e8f0]">
                          {isHit
                            ? highlightSearchInMessage(
                                line.message,
                                searchQuery.trim(),
                                isCurrent,
                              )
                            : highlightMessage(line.message)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {showNewLinesBadge || historyBrowsing ? (
              <button
                type="button"
                onClick={jumpToLatest}
                className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-[#1e293b]/95 px-3 py-1.5 text-[11px] font-medium text-[#e2e8f0] shadow-[0_4px_16px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-colors hover:bg-[#334155]"
              >
                {historyBrowsing ? (
                  <span>回到最新 · 恢复 Follow</span>
                ) : (
                  <>
                    <span className="tabular-nums">↓ {newLineCount} new lines</span>
                    <span className="text-[#94a3b8]">·</span>
                    <span>Jump to latest</span>
                  </>
                )}
              </button>
            ) : null}
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
        onScroll={updateFollowFromScroll}
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

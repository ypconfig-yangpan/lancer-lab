import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileDown,
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
import {
  buildAiContextMarkdown,
  type AiContextMeta,
} from "@/capabilities/kubernetes/logs/ai-context-md";
import { kubernetesApi } from "@/capabilities/kubernetes/api";
import { Button } from "@/components/ui/button";
import { CompactSelect } from "@/components/ui/compact-select";
import type { LogLevel, LogLine } from "@/entities/log/types";
import type { NativeLogSearchMatch } from "@/native/types";
import { formatInstant } from "@/shared/lib/datetime";
import { cn } from "@/shared/lib/utils";

const READ_WINDOW_SIZES = [2_000, 5_000, 10_000, 20_000] as const;
const SEARCH_DEBOUNCE_MS = 300;
const SEARCH_PAGE = 200;
/** Rows from edge before sliding the Read Window (preload). */
const EDGE_PRELOAD = 60;

type SearchUiStatus = "idle" | "searching" | "ready" | "cancelled" | "error";

interface LogViewerProps {
  lines: LogLine[];
  onPausedChange?: (paused: boolean) => void;
  variant?: "default" | "terminal";
  /** Shown in terminal chrome header (e.g. pod picker). */
  toolbarStart?: ReactNode;
  /**
   * Source params (Since / Tail / Previous). Hidden in compact (homepage) until fullscreen.
   */
  toolbarSecondary?: ReactNode;
  /**
   * Narrow embed: lean header; Since/Tail/read-window only in fullscreen.
   */
  compactToolbar?: boolean;
  title?: string;
  /** Homepage: start collapsed to header-only strip. */
  defaultCollapsed?: boolean;
  /** Notify parent when user collapses/expands (for lazy openLogs). */
  onCollapsedChange?: (collapsed: boolean) => void;
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
  /** Flat source label for AI Context MD (pod/container). */
  sourceLabel?: string;
  /** Extra meta for standard AI Context Markdown export. */
  aiContextMeta?: AiContextMeta;
  /** Stream status from managed-log session (following / error / open…). */
  streamStatus?: string | null;
  /** Re-open follow without clearing the visible buffer. */
  onReconnect?: () => void;
  /** Session total lines (for Jump to Line clamp). */
  totalLines?: number;
  /** Jump to timestamp (ISO or HH:mm[:ss]); returns found line or null. */
  onJumpToTime?: (target: string) => Promise<number | null>;
  /** Sliding Read Window size (pane-owned). */
  readWindowSize?: number;
  onReadWindowSizeChange?: (size: number) => void;
  windowOffset?: number;
  canSlideOlder?: boolean;
  canSlideNewer?: boolean;
  onSlideOlder?: () => void;
  onSlideNewer?: () => void;
  /** Stop pin-to-tail refetch; freeze window at current offset (required before sliding). */
  onFreezeReadWindow?: () => void;
  /** Leave history browse and pin to live tail. */
  onPinLiveTail?: () => void;
  historyBrowsing?: boolean;
  /** Soft Clear mask active (history hidden above divider). */
  onViewportMaskChange?: (masked: boolean) => void;
}

type ViewportRow =
  | { kind: "divider"; id: string }
  | { kind: "line"; id: string; line: LogLine };

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
  toolbarSecondary,
  compactToolbar = false,
  title = "实时日志",
  defaultCollapsed = false,
  onCollapsedChange,
  enableCollapse = true,
  enableFullscreen = true,
  expandedClassName = "h-[min(420px,44vh)]",
  density = "comfortable",
  statusHint,
  sessionId = null,
  onSeekToLine,
  sourceLabel,
  aiContextMeta,
  streamStatus = null,
  onReconnect,
  totalLines,
  onJumpToTime,
  readWindowSize = 5_000,
  onReadWindowSizeChange,
  windowOffset = 0,
  canSlideOlder = false,
  canSlideNewer = false,
  onSlideOlder,
  onSlideNewer,
  onFreezeReadWindow,
  onPinLiveTail,
  historyBrowsing = false,
  onViewportMaskChange,
}: LogViewerProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const jumpInputRef = useRef<HTMLInputElement | null>(null);
  const unfollowAtLineRef = useRef<number | null>(null);
  const searchGenRef = useRef(0);
  const slideLockRef = useRef(false);
  const pendingAnchorLineRef = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [followTail, setFollowTail] = useState(true);
  const [newLineCount, setNewLineCount] = useState(0);
  const [levelFilter, setLevelFilter] = useState<LogLevel | "ALL">("ALL");
  const [keyword, setKeyword] = useState("");
  /**
   * Soft Viewport Mask (Clear): hide lines with lineNumber ≤ mask.
   * Disk unchanged; new lines append below divider.
   */
  const [clearMaskAt, setClearMaskAt] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [fullscreen, setFullscreen] = useState(false);
  const terminal = variant === "terminal";

  useEffect(() => {
    onCollapsedChange?.(collapsed);
  }, [collapsed, onCollapsedChange]);

  useEffect(() => {
    onViewportMaskChange?.(clearMaskAt !== null);
  }, [clearMaskAt, onViewportMaskChange]);

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
    setClearMaskAt(null);
    setFollowTail(true);
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
      setClearMaskAt(null);
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
      setClearMaskAt(null);
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

  // Read Window from pane is already sized — do not grow/clip a second buffer here.
  const filtered = useMemo(() => {
    return lines.filter((line) => {
      if (clearMaskAt !== null && line.lineNumber <= clearMaskAt) {
        return false;
      }
      if (levelFilter !== "ALL" && line.level !== levelFilter) {
        return false;
      }
      if (keyword && !line.message.toLowerCase().includes(keyword.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [lines, keyword, levelFilter, clearMaskAt]);

  const viewportRows = useMemo((): ViewportRow[] => {
    const rows: ViewportRow[] = [];
    if (clearMaskAt !== null) {
      rows.push({ kind: "divider", id: "viewport-clear-divider" });
    }
    for (const line of filtered) {
      rows.push({ kind: "line", id: line.id, line });
    }
    return rows;
  }, [filtered, clearMaskAt]);

  const showBody = !collapsed || fullscreen;

  const virtualizer = useVirtualizer({
    count: viewportRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (viewportRows[index]?.kind === "divider" ? 28 : 24),
    overscan: 24,
  });

  const rowIndexForLine = useCallback(
    (lineNumber: number) => {
      const fi = filtered.findIndex((l) => l.lineNumber === lineNumber);
      if (fi < 0) return -1;
      return clearMaskAt !== null ? fi + 1 : fi;
    },
    [filtered, clearMaskAt],
  );

  useEffect(() => {
    if (followTail) {
      unfollowAtLineRef.current = null;
      setNewLineCount(0);
      return;
    }
    const lastNum = totalLines ?? lines[lines.length - 1]?.lineNumber ?? 0;
    if (unfollowAtLineRef.current === null) {
      unfollowAtLineRef.current = lastNum;
      setNewLineCount(0);
      return;
    }
    setNewLineCount(Math.max(0, lastNum - unfollowAtLineRef.current));
  }, [followTail, totalLines, lines]);

  useEffect(() => {
    if (!followTail || viewportRows.length === 0 || !showBody || searchOpen) {
      return;
    }
    virtualizer.scrollToIndex(viewportRows.length - 1, { align: "end" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportRows.length, followTail, showBody, searchOpen, clearMaskAt]);

  // Release slide lock if anchor never resolved (e.g. empty window).
  useEffect(() => {
    if (!slideLockRef.current) return;
    const t = window.setTimeout(() => {
      slideLockRef.current = false;
    }, 900);
    return () => window.clearTimeout(t);
  }, [windowOffset, filtered.length]);

  const filteredRef = useRef(filtered);
  filteredRef.current = filtered;
  const viewportRowsRef = useRef(viewportRows);
  viewportRowsRef.current = viewportRows;
  const onSeekRef = useRef(onSeekToLine);
  onSeekRef.current = onSeekToLine;
  const virtualizerRef = useRef(virtualizer);
  virtualizerRef.current = virtualizer;
  const pendingFocusLineRef = useRef<number | null>(null);
  const windowOffsetRef = useRef(windowOffset);
  windowOffsetRef.current = windowOffset;

  // Scroll Anchor: after slide, keep the anchored line at the same visual place.
  useEffect(() => {
    const anchor = pendingAnchorLineRef.current;
    if (anchor === null) return;
    const idx = rowIndexForLine(anchor);
    if (idx < 0) return;
    virtualizer.scrollToIndex(idx, { align: "start" });
    pendingAnchorLineRef.current = null;
    slideLockRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, windowOffset, rowIndexForLine]);

  const focusMatch = useCallback(
    (match: NativeLogSearchMatch | undefined) => {
      if (!match) return;
      setFollowTail(false);
      setClearMaskAt((mask) => {
        if (mask !== null && match.lineNumber <= mask) return null;
        return mask;
      });
      const idx = rowIndexForLine(match.lineNumber);
      if (idx >= 0) {
        pendingFocusLineRef.current = null;
        virtualizerRef.current.scrollToIndex(idx, { align: "center" });
        return;
      }
      pendingFocusLineRef.current = match.lineNumber;
      onSeekRef.current?.(match.lineNumber);
    },
    [rowIndexForLine],
  );

  // After seek / window update, center the pending (or current) match.
  useEffect(() => {
    if (!searchOpen) return;
    const target =
      pendingFocusLineRef.current ?? matches[matchIndex]?.lineNumber ?? null;
    if (target === null) return;
    const idx = rowIndexForLine(target);
    if (idx < 0) return;
    pendingFocusLineRef.current = null;
    virtualizer.scrollToIndex(idx, { align: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, matchIndex, matches, searchOpen, rowIndexForLine]);

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

  const buildContextMd = () => {
    const match = matches[matchIndex];
    const focusLineNumber =
      match?.lineNumber ?? filtered[Math.floor(filtered.length / 2)]?.lineNumber;
    return buildAiContextMarkdown({
      meta: {
        ...(aiContextMeta ?? {}),
        ...(sourceLabel ? { sourceLabel } : {}),
      },
      lines: filtered,
      ...(focusLineNumber !== undefined ? { focusLineNumber } : {}),
      ...(searchQuery.trim() ? { searchQuery: searchQuery.trim() } : {}),
      contextRadius: 50,
    });
  };

  /** Copy standard AI Context Markdown for external AI Coder. */
  const copyContext = () => {
    if (filtered.length === 0) return;
    void navigator.clipboard.writeText(buildContextMd());
  };

  /** Download the same package as `.md` file. */
  const downloadContextMd = () => {
    if (filtered.length === 0) return;
    const md = buildContextMd();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lancer-ai-context-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
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

  /** Soft Clear: mask history in viewport; L2 disk untouched. */
  const clearViewport = () => {
    const at = totalLines ?? lines[lines.length - 1]?.lineNumber ?? 0;
    setClearMaskAt(at);
    setFollowFlow(true);
    onPinLiveTail?.();
    setNewLineCount(0);
    unfollowAtLineRef.current = null;
  };

  const restoreMaskedHistory = () => {
    setClearMaskAt(null);
  };

  const jumpToLatest = () => {
    setClearMaskAt(null);
    setFollowFlow(true);
    onPinLiveTail?.();
    onSeekToLine?.(0);
  };

  const requestSlideOlder = () => {
    if (!onSlideOlder || slideLockRef.current) return;
    // Sliding into older history → drop soft mask.
    setClearMaskAt(null);
    // Freeze first so we leave pin-to-tail; then slide using frozen/current offset.
    if (!historyBrowsing) {
      onFreezeReadWindow?.();
    }
    if (!canSlideOlder && windowOffset <= 0) return;
    const items = virtualizerRef.current.getVirtualItems();
    const firstIdx = items[0]?.index ?? 0;
    const row = viewportRowsRef.current[firstIdx];
    pendingAnchorLineRef.current =
      row?.kind === "line" ? row.line.lineNumber : filteredRef.current[0]?.lineNumber ?? null;
    slideLockRef.current = true;
    setFollowTail(false);
    onSlideOlder();
  };

  const requestSlideNewer = () => {
    if (!canSlideNewer || !onSlideNewer || slideLockRef.current || followTail) return;
    const items = virtualizerRef.current.getVirtualItems();
    const last = items[items.length - 1];
    const lastIdx = last?.index ?? viewportRowsRef.current.length - 1;
    const row = viewportRowsRef.current[lastIdx];
    pendingAnchorLineRef.current =
      row?.kind === "line"
        ? row.line.lineNumber
        : filteredRef.current[filteredRef.current.length - 1]?.lineNumber ?? null;
    slideLockRef.current = true;
    onSlideNewer();
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

  const [nearTop, setNearTop] = useState(false);

  const tryEdgeSlide = (following: boolean) => {
    if (following || slideLockRef.current) return;
    const items = virtualizerRef.current.getVirtualItems();
    if (items.length === 0) return;
    const first = items[0]!.index;
    const last = items[items.length - 1]!.index;
    const n = viewportRowsRef.current.length;
    const atTop = first < EDGE_PRELOAD;
    setNearTop(atTop);
    if (atTop && canSlideOlder) {
      requestSlideOlder();
    }
    if (n > 0 && last > n - EDGE_PRELOAD && canSlideNewer) {
      requestSlideNewer();
    }
  };

  const updateFollowFromScroll = () => {
    const el = parentRef.current;
    if (!el) return;

    let following = followTail;
    if (following) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      if (!nearBottom) {
        setFollowTail(false);
        following = false;
        // Critical: freeze window or 200ms tail refetch keeps resetting to "latest N".
        onFreezeReadWindow?.();
      }
    }
    // Same scroll frame: after leaving Follow, allow edge slide (don't wait next event).
    tryEdgeSlide(following);
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
    /** Homepage compact: hide Since/Tail/read-window until fullscreen. */
    const showExtendedChrome = !compactToolbar || fullscreen;
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
            "flex shrink-0 items-center gap-1.5 border-b border-border-subtle px-3",
            "h-10 min-h-10",
          )}
        >
          <span className="shrink-0 text-[13px] font-semibold text-foreground">{title}</span>
          {/* Collapsed / minimize: title + chevron only — no options. */}
          {!collapsed ? (
            <>
              {toolbarStart}
              {showExtendedChrome ? toolbarSecondary : null}
              {showExtendedChrome ? (
                <CompactSelect
                  value={readWindowSize}
                  onChange={(e) => onReadWindowSizeChange?.(Number(e.target.value))}
                  title="阅读窗口：当前内存中滑动窗口大小（不是磁盘上限）"
                  triggerClassName="w-[108px]"
                >
                  {READ_WINDOW_SIZES.map((n) => (
                    <option key={n} value={n}>
                      阅读窗 {n >= 1000 ? `${n / 1000}k` : n}
                    </option>
                  ))}
                </CompactSelect>
              ) : null}
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
              {showExtendedChrome ? (
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
              ) : null}
              <button
                type="button"
                className={iconBtn(paused)}
                onClick={togglePause}
                title={paused ? t("logs.resume") : t("logs.pause")}
              >
                {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              </button>
              {clearMaskAt !== null ? (
                <button
                  type="button"
                  className={iconBtn(true)}
                  onClick={restoreMaskedHistory}
                  title="恢复已隐藏的视口历史"
                >
                  <RotateCcw className="size-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  className={iconBtn()}
                  onClick={clearViewport}
                  title="清空视口（不删本地缓存）；新日志在分割线下继续"
                >
                  <SquareX className="size-3.5" />
                </button>
              )}
              {showExtendedChrome ? (
                <button type="button" className={iconBtn()} onClick={downloadLogs} title="下载">
                  <Download className="size-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                className={iconBtn()}
                onClick={copyContext}
                title="复制 AI Context（标准 Markdown，给外部 AI Coder）"
              >
                <Copy className="size-3.5" />
              </button>
              {showExtendedChrome ? (
                <button
                  type="button"
                  className={iconBtn()}
                  onClick={downloadContextMd}
                  title="下载 AI Context.md（给外部 AI Coder）"
                >
                  <FileDown className="size-3.5" />
                </button>
              ) : null}
            </>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {collapsed ? null : showExtendedChrome && statusHint ? (
              <span
                className="hidden max-w-[200px] truncate text-[10px] text-muted-foreground xl:inline"
                title={statusHint}
              >
                {statusHint}
              </span>
            ) : !collapsed && compactToolbar && !fullscreen ? (
              <span
                className="text-[10px] text-muted-foreground"
                title={statusHint ?? undefined}
              >
                {streamStatus === "error"
                  ? "断流"
                  : followTail
                    ? "● 实时跟随"
                    : "⏸ 已暂停"}
              </span>
            ) : null}
            {!collapsed ? (
              <span
                className="text-[10px] tabular-nums text-muted-foreground"
                title={
                  clearMaskAt !== null
                    ? `视口已隐藏历史 · 本地已缓存 ${totalLines ?? 0} 行`
                    : totalLines
                      ? `渲染 ${filtered.length} · 本地 ${totalLines}`
                      : `渲染 ${filtered.length}`
                }
              >
                {clearMaskAt !== null
                  ? `隐藏 · ${filtered.length}${totalLines ? ` / ${totalLines}` : ""}`
                  : `${filtered.length}${totalLines ? ` / ${totalLines}` : ""}`}
              </span>
            ) : null}
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
            {!collapsed && enableFullscreen ? (
              <button
                type="button"
                className={iconBtn(fullscreen)}
                onClick={() => {
                  setFullscreen((v) => !v);
                  if (!fullscreen) setCollapsed(false);
                }}
                title={
                  fullscreen
                    ? "退出全屏 (Esc)"
                    : compactToolbar
                      ? "全屏（Since / Tail 等）"
                      : "全屏"
                }
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
              {viewportRows.length === 0 ? (
                <div className="flex h-full min-w-full flex-col items-center justify-center gap-3 text-[#64748b]">
                  <span>—</span>
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
                    const row = viewportRows[virtualRow.index];
                    if (!row) {
                      return null;
                    }
                    if (row.kind === "divider") {
                      return (
                        <div
                          key={row.id}
                          className="absolute left-0 top-0 flex w-max min-w-full items-center justify-center gap-2 whitespace-pre text-[#94a3b8]"
                          style={{
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <span className="text-[#475569]">---</span>
                          <span>视口已清空</span>
                          <button
                            type="button"
                            onClick={restoreMaskedHistory}
                            className="rounded px-1 text-[#7dd3fc] underline decoration-[#7dd3fc]/40 underline-offset-2 hover:text-[#bae6fd]"
                          >
                            点击恢复历史
                          </button>
                          <span className="text-[#475569]">---</span>
                        </div>
                      );
                    }
                    const line = row.line;
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
            {nearTop && !followTail && clearMaskAt === null ? (
              canSlideOlder ? (
                <button
                  type="button"
                  onClick={requestSlideOlder}
                  className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-[#1e293b]/90 px-3 py-1 text-[11px] text-[#e2e8f0] hover:bg-[#334155]"
                >
                  ↑ 向前滑动阅读窗
                </button>
              ) : (
                <div className="absolute top-3 left-1/2 z-10 flex max-w-[min(92%,420px)] -translate-x-1/2 flex-col items-center gap-0.5 rounded-full border border-white/10 bg-[#1e293b]/95 px-3 py-1.5 text-center text-[11px] text-[#e2e8f0] shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
                  <span>
                    已到本次 session 第 1 行（本地共 {totalLines ?? 0} 行）
                  </span>
                  <span className="text-[10px] text-[#94a3b8]">
                    {(totalLines ?? 0) <= readWindowSize
                      ? "本地行数 ≤ 阅读窗，没有更早可滑；要 Pod 更早历史请加大「拉取 Tail / Since」后重开"
                      : "继续上滑应向前换窗；若仍不动请点上方「向前滑动」"}
                  </span>
                </div>
              )
            ) : null}
            {showNewLinesBadge || historyBrowsing ? (
              <button
                type="button"
                onClick={jumpToLatest}
                className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-[#1e293b]/95 px-3 py-1.5 text-[11px] font-medium text-[#e2e8f0] shadow-[0_4px_16px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-colors hover:bg-[#334155]"
              >
                {historyBrowsing ? (
                  <span>⬇ 回到最新 · 恢复实时</span>
                ) : (
                  <>
                    <span className="tabular-nums">⬇ 回到最新 · 恢复实时</span>
                    {newLineCount > 0 ? (
                      <span className="text-[#94a3b8]">(有 {newLineCount} 条新日志)</span>
                    ) : null}
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

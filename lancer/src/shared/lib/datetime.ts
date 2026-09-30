import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useEffect, useState } from "react";

/** Kubernetes / API timestamps stay ISO8601; format only at UI boundary. */
export function formatInstant(iso8601: string, pattern = "yyyy-MM-dd HH:mm:ss"): string {
  if (!iso8601) return "—";
  try {
    return format(parseISO(iso8601), pattern);
  } catch {
    return iso8601;
  }
}

/** Rancher-style relative age: 38 secs / 26 days. */
export function formatAge(iso8601: string): string {
  if (!iso8601) return "—";
  try {
    const d = parseISO(iso8601);
    if (Number.isNaN(d.getTime())) return "—";
    return formatDistanceToNowStrict(d, { addSuffix: false, locale: zhCN, roundingMethod: "floor" });
  } catch {
    return "—";
  }
}

export function ageSecondsFrom(iso8601: string, now = Date.now()): number {
  if (!iso8601) return 0;
  try {
    const ms = now - parseISO(iso8601).getTime();
    return Math.max(0, Math.floor(ms / 1000));
  } catch {
    return 0;
  }
}

/** Re-render every `ms` so Age / 上次重启 relative text keep ticking. */
export function useNowTick(ms = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

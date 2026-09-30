import { useEffect, useRef, useState } from "react";
import { jenkinsApi } from "@/capabilities/jenkins/api";
import { MockTerminal } from "@/shared/dashboard-ui";

/** Progressive Jenkins 控制台输出. */
export function JenkinsConsolePane({
  jobFullName,
  number,
  follow,
  title,
}: {
  jobFullName: string;
  number: number;
  follow: boolean;
  title?: string;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const startRef = useRef(0);
  const moreRef = useRef(true);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    startRef.current = 0;
    moreRef.current = true;
    setText("");
    setError(null);
  }, [jobFullName, number]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled) return;
      try {
        const chunk = await jenkinsApi.getConsole({
          jobFullName,
          number,
          start: startRef.current,
        });
        if (cancelled) return;
        if (chunk.text) {
          setText((prev) => prev + chunk.text);
        }
        startRef.current = chunk.nextStart;
        moreRef.current = chunk.moreData;
        setError(null);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
      if (!cancelled && (follow || moreRef.current)) {
        timer = window.setTimeout(() => void tick(), 1_200);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [jobFullName, number, follow]);

  useEffect(() => {
    const el = boxRef.current?.querySelector(".overflow-auto");
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [text]);

  const lines =
    text.length === 0 ? (error ? [`ERROR: ${error}`] : ["（等待日志…）"]) : text.split("\n");

  return (
    <div ref={boxRef} className="min-h-[220px]">
      <MockTerminal
        title={
          title ??
          `控制台输出 · #${number}${follow ? " · 实时" : ""}`
        }
        lines={lines}
        className="h-[280px]"
        colorize
      />
    </div>
  );
}

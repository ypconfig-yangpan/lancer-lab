import { useEffect, useRef, useState } from "react";
import { useConnectionSessionStore } from "@/capabilities/connections/connect/connection-session-store";
import {
  useConnectJenkins,
  useJenkinsStatus,
} from "@/capabilities/jenkins/connect/use-jenkins-queries";
import { formatAppError } from "@/shared/lib/app-error";

/**
 * Auto-connect Jenkins from ~/.lancer/jenkins.json on mount.
 * 只尝试一次，失败后停住，避免打包后疯狂重连。
 */
export function useEnsureJenkinsConnection() {
  const statusQuery = useJenkinsStatus();
  const connect = useConnectJenkins();
  const jenkinsAutoConnect = useConnectionSessionStore((s) => s.jenkinsAutoConnect);
  const inFlight = useRef(false);
  const attempted = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const connected = statusQuery.data?.connected === true;
  const statusLoading = statusQuery.isLoading;
  const connectPending = connect.isPending;
  const mutateAsync = connect.mutateAsync;

  // 用户主动断开后，允许下次打开自动连再试一次
  useEffect(() => {
    if (!jenkinsAutoConnect) {
      attempted.current = false;
    }
  }, [jenkinsAutoConnect]);

  useEffect(() => {
    if (inFlight.current || statusLoading || connectPending || connected) {
      return;
    }
    if (!jenkinsAutoConnect) {
      setLocalError("已断开连接。请到「凭证」点「连接」");
      return;
    }
    if (attempted.current) {
      return;
    }

    attempted.current = true;
    inFlight.current = true;
    setLocalError(null);
    void (async () => {
      try {
        await mutateAsync({});
        setLocalError(null);
      } catch (err: unknown) {
        const formatted = formatAppError(err);
        setLocalError(`${formatted.code}: ${formatted.message}`);
      } finally {
        inFlight.current = false;
      }
    })();
  }, [statusLoading, connectPending, connected, mutateAsync, jenkinsAutoConnect]);

  return {
    connecting: jenkinsAutoConnect && (connectPending || (statusLoading && !connected)),
    connected,
    status: statusQuery.data,
    error: localError,
    paused: !jenkinsAutoConnect && !connected,
    refreshStatus: () => {
      attempted.current = false;
      void statusQuery.refetch();
    },
  };
}

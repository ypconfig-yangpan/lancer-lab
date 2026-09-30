import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@lancer/ui";
import { formatAppError } from "@/shared/lib/app-error";

interface ResourceQueryStateProps {
  clusterId: string | null;
  namespace: string;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyKey: "workspace.emptyPods" | "workspace.emptyDeployments" | "workspace.emptyServices";
  loadingKey?: "workspace.loading" | "workspace.loadingResources";
  onRefresh: () => void;
  children: ReactNode;
}

export function ResourceQueryGate({
  clusterId,
  namespace,
  isLoading,
  isError,
  error,
  isEmpty,
  emptyKey,
  loadingKey = "workspace.loadingResources",
  onRefresh,
  children,
}: ResourceQueryStateProps) {
  const { t } = useTranslation();

  if (clusterId === null) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-[13px] text-muted-foreground">
        {t("workspace.selectCluster")}
      </div>
    );
  }

  if (isLoading && isEmpty) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        {t(loadingKey)}
      </div>
    );
  }

  if (isError && isEmpty) {
    const err = formatAppError(error);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[13px]">
        <p className="text-destructive">
          {err.code}: {err.message}
        </p>
        <Button variant="secondary" size="sm" onClick={onRefresh}>
          {t("workspace.refresh")}
        </Button>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[13px] text-muted-foreground">
        <p>{t(emptyKey, { namespace })}</p>
        <Button variant="secondary" size="sm" onClick={onRefresh}>
          {t("workspace.refresh")}
        </Button>
      </div>
    );
  }

  return children;
}

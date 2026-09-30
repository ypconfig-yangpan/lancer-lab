import { useTranslation } from "react-i18next";
import { Button, InspectorSection } from "@lancer/ui";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";

/** Pod Inspector quick chain: Logs / Exec. */
export function PodQuickActions() {
  const { t } = useTranslation();
  const setActiveBottomViewId = useWorkspaceStore((s) => s.setActiveBottomViewId);

  return (
    <InspectorSection title={t("deployment.write.title")}>
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setActiveBottomViewId("kubernetes.logs")}
        >
          {t("explorer.openLogs")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setActiveBottomViewId("kubernetes.exec")}
        >
          {t("explorer.openExec")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setActiveBottomViewId("kubernetes.events")}
        >
          {t("bottom.events")}
        </Button>
      </div>
    </InspectorSection>
  );
}

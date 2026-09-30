import { lazy, Suspense, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@lancer/ui";
import type { ManifestResourceKind } from "@/entities/yaml/types";
import { useResourceYaml } from "@/capabilities/kubernetes/connect/use-cluster-connection";
import { formatAppError } from "@/shared/lib/app-error";
import { type ThemeMode, useWorkspaceStore } from "@/shared/stores/workspace-store";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

interface ResourceYamlPaneProps {
  clusterId: string;
  namespace: string;
  kind: ManifestResourceKind;
  name: string;
}

function resolveEditorTheme(theme: ThemeMode): "vs-dark" | "light" {
  if (theme === "dark") {
    return "vs-dark";
  }
  if (theme === "light") {
    return "light";
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "vs-dark" : "light";
}

export function ResourceYamlPane({ clusterId, namespace, kind, name }: ResourceYamlPaneProps) {
  const { t } = useTranslation();
  const theme = useWorkspaceStore((s) => s.theme);
  const query = useResourceYaml(clusterId, namespace, kind, name, true);
  const editorTheme = useMemo(() => resolveEditorTheme(theme), [theme]);

  if (query.isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {t("detail.loadingYaml")}
      </div>
    );
  }

  if (query.isError) {
    const err = formatAppError(query.error);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-3 text-center text-xs">
        <p className="text-destructive">
          {err.code}: {err.message}
        </p>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
          {t("workspace.refresh")}
        </Button>
      </div>
    );
  }

  const yaml = query.data?.yaml ?? "";
  const resourceVersion = query.data?.resourceVersion ?? "";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {resourceVersion.length > 0 ? (
        <div className="border-b border-border-subtle px-2 py-1 font-mono text-[10px] text-muted-foreground">
          {t("detail.resourceVersion")}: {resourceVersion}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
              {t("detail.loadingEditor")}
            </div>
          }
        >
          <MonacoEditor
            language="yaml"
            theme={editorTheme}
            value={yaml}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              fontSize: 12,
              fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace",
              automaticLayout: true,
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}

export type InspectorDetailTab = "summary" | "yaml";

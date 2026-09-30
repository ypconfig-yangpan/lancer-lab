import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClusterConnectPanel } from "@/capabilities/kubernetes/connect/cluster-connect-panel";
import {
  type ResourceListKind,
  useKubernetesWorkspaceStore,
} from "@/capabilities/kubernetes/connect/kubernetes-workspace-store";
import { useNamespaces } from "@/capabilities/kubernetes/connect/use-cluster-connection";
import { K8S_DEMO_TREE } from "@/capabilities/kubernetes/demo/demo-data";
import { cn } from "@/shared/lib/utils";
import { useTabsStore } from "@/shared/stores/tabs-store";
import { useWorkspaceStore } from "@/shared/stores/workspace-store";

const WORKLOAD_KINDS: { kind: ResourceListKind; labelKey: string }[] = [
  { kind: "deployment", labelKey: "workspace.kinds.deployment" },
  { kind: "pod", labelKey: "workspace.kinds.pod" },
];

const NETWORK_KINDS: { kind: ResourceListKind; labelKey: string }[] = [
  { kind: "service", labelKey: "workspace.kinds.service" },
];

const COMING_SOON = ["Config", "Storage", "Network"] as const;

/**
 * Explorer: Namespace tree — Workloads / Services / Events; Config/Storage/Network grey.
 */
export function KubernetesExplorerView() {
  const { t } = useTranslation();
  const clusterId = useKubernetesWorkspaceStore((s) => s.activeClusterId);
  const namespace = useKubernetesWorkspaceStore((s) => s.namespace);
  const setNamespace = useKubernetesWorkspaceStore((s) => s.setNamespace);
  const kind = useKubernetesWorkspaceStore((s) => s.resourceListKind);
  const setKind = useKubernetesWorkspaceStore((s) => s.setResourceListKind);
  const openWorkspaceTab = useTabsStore((s) => s.openWorkspaceTab);
  const setActiveBottomViewId = useWorkspaceStore((s) => s.setActiveBottomViewId);
  const namespacesQuery = useNamespaces(clusterId);
  const [expandedNs, setExpandedNs] = useState<string | null>(namespace);
  const [demoOpen, setDemoOpen] = useState(false);

  useEffect(() => {
    if (namespace) {
      setExpandedNs(namespace);
    }
  }, [namespace]);

  const openResources = (ns: string, nextKind?: ResourceListKind) => {
    setNamespace(ns);
    setExpandedNs(ns);
    if (nextKind) {
      setKind(nextKind);
    }
    openWorkspaceTab(
      {
        id: "kubernetes:kubernetes.resources",
        viewId: "kubernetes.resources",
        moduleId: "kubernetes",
        title: "Resources",
      },
      "preview",
    );
  };

  const namespaces = namespacesQuery.data ?? [];
  const namespaceOptions =
    namespaces.includes(namespace) || namespace.length === 0
      ? namespaces
      : [namespace, ...namespaces];

  return (
    <div className="flex h-full flex-col text-[13px]">
      <ClusterConnectPanel />

      {clusterId !== null ? (
        <div className="min-h-0 flex-1 overflow-auto py-1">
          <SectionTitle>{t("sidebar.namespace")}</SectionTitle>
          {namespacesQuery.isLoading ? (
            <p className="px-3 py-1 text-[12px] text-muted-foreground">{t("workspace.loading")}</p>
          ) : namespacesQuery.isError ? (
            <p className="px-3 py-1 text-[12px] text-destructive">
              {namespacesQuery.error instanceof Error
                ? namespacesQuery.error.message
                : "Failed to load namespaces"}
            </p>
          ) : namespaceOptions.length === 0 ? (
            <p className="px-3 py-1 text-[12px] text-muted-foreground">No namespaces</p>
          ) : (
            <ul className="space-y-0.5 px-1">
              {namespaceOptions.map((ns) => {
                const expanded = expandedNs === ns;
                const nsActive = namespace === ns;
                return (
                  <li key={ns}>
                    <button
                      type="button"
                      className={cn(
                        "relative flex h-7 w-full items-center gap-1 rounded-[6px] px-1.5 text-left transition-colors duration-[var(--transition-fast)] hover:bg-surface-hover",
                        nsActive && !expanded && "bg-surface-selected lancer-select-accent",
                      )}
                      onClick={() => {
                        if (expanded) {
                          setExpandedNs(null);
                        } else {
                          openResources(ns);
                        }
                      }}
                    >
                      <Chevron open={expanded} />
                      <span className="truncate font-mono text-[12px]">{ns}</span>
                    </button>
                    {expanded ? (
                      <div className="ml-2 border-l border-border-subtle py-0.5 pl-1">
                        <GroupLabel>{t("explorer.workloads")}</GroupLabel>
                        <ul className="space-y-0.5">
                          {WORKLOAD_KINDS.map((item) => (
                            <li key={item.kind}>
                              <KindRow
                                label={t(item.labelKey)}
                                active={nsActive && kind === item.kind}
                                depth={1}
                                onClick={() => openResources(ns, item.kind)}
                              />
                            </li>
                          ))}
                        </ul>
                        <GroupLabel>{t("explorer.services")}</GroupLabel>
                        <ul className="space-y-0.5">
                          {NETWORK_KINDS.map((item) => (
                            <li key={item.kind}>
                              <KindRow
                                label={t(item.labelKey)}
                                active={nsActive && kind === item.kind}
                                depth={1}
                                onClick={() => openResources(ns, item.kind)}
                              />
                            </li>
                          ))}
                        </ul>
                        <GroupLabel>{t("bottom.events")}</GroupLabel>
                        <ul className="space-y-0.5">
                          <li>
                            <KindRow
                              label={t("bottom.events")}
                              active={false}
                              depth={1}
                              onClick={() => {
                                openResources(ns);
                                setActiveBottomViewId("kubernetes.events");
                              }}
                            />
                          </li>
                        </ul>
                        <GroupLabel>{t("explorer.more")}</GroupLabel>
                        <ul className="space-y-0.5">
                          {COMING_SOON.map((label) => (
                            <li key={label}>
                              <div
                                className="flex h-7 items-center justify-between rounded-[6px] px-2 text-[12px] text-muted-foreground/60"
                                style={{ paddingLeft: 16 }}
                              >
                                <span>{label}</span>
                                <span className="text-[10px] uppercase tracking-wide">
                                  {t("explorer.comingSoon")}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-1.5">
          <button
            type="button"
            className="flex w-full items-center gap-1 rounded-[6px] px-2 py-1.5 text-left text-[12px] text-muted-foreground hover:bg-surface-hover hover:text-foreground"
            onClick={() => setDemoOpen((v) => !v)}
          >
            <Chevron open={demoOpen} />
            <span>{t("explorer.demoPreview")}</span>
          </button>
          {demoOpen ? (
            <div className="mt-1 ml-2 space-y-1 border-l border-border-subtle pl-2">
              <p className="px-1 text-[11px] text-muted-foreground">{K8S_DEMO_TREE.cluster}</p>
              {K8S_DEMO_TREE.namespaces.map((ns) => (
                <KindRow
                  key={ns}
                  label={ns}
                  active={namespace === ns}
                  depth={0}
                  mono
                  onClick={() => setNamespace(ns)}
                />
              ))}
              <p className="px-1 pt-1 text-[11px] text-muted-foreground">
                {t("explorer.demoHint")}
              </p>
            </div>
          ) : (
            <p className="px-2 py-2 text-[12px] text-muted-foreground">
              {t("explorer.connectHint")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
      {children}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className="flex size-3.5 shrink-0 items-center justify-center text-[10px] text-muted-foreground"
      aria-hidden
    >
      {open ? "▼" : "▶"}
    </span>
  );
}

function KindRow({
  label,
  active,
  onClick,
  depth,
  mono,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  depth: number;
  mono?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "relative flex h-7 w-full items-center rounded-[6px] text-left transition-colors duration-[var(--transition-fast)] hover:bg-surface-hover",
        active && "bg-surface-selected font-medium text-primary lancer-select-accent",
        mono && "font-mono text-[12px]",
      )}
      style={{ paddingLeft: 8 + depth * 8, paddingRight: 8 }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

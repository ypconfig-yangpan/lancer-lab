import { lazy, Suspense, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CompactSelect } from "@/components/ui/compact-select";
import { useConnectionSessionStore } from "@/capabilities/connections/connect/connection-session-store";
import {
  useImportKubeconfig,
  useJenkinsLocalConfig,
  useKubeCredentialStatus,
  useSavedKubeconfigYaml,
  useSaveJenkinsLocalConfig,
  useSetKubePreferredContext,
} from "@/capabilities/connections/connect/use-credentials-queries";
import {
  useConnectCluster,
  useConnectedClusters,
  useDisconnectCluster,
} from "@/capabilities/kubernetes/connect/use-cluster-connection";
import {
  KUBE_PREFERRED_FALLBACK_NAMESPACE,
  resolveWorkingNamespace,
} from "@/capabilities/kubernetes/connect/namespace-options";
import {
  useConnectJenkins,
  useDisconnectJenkins,
  useJenkinsStatus,
} from "@/capabilities/jenkins/connect/use-jenkins-queries";
import { PageTabsBar, PanelCard } from "@/shared/dashboard-ui";
import { formatAppError } from "@/shared/lib/app-error";
import { cn } from "@/shared/lib/utils";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

type CredTab = "kubernetes" | "jenkins";

/**
 * 本机凭证配置：K8s 粘贴 kubeconfig；Jenkins 填地址/账号/Token。
 * 不写入安装包，只存 ~/.lancer/
 */
export function CredentialsHome() {
  const [tab, setTab] = useState<CredTab>("kubernetes");
  const kubeStatus = useKubeCredentialStatus();
  const jenkinsCfg = useJenkinsLocalConfig();
  const jenkinsStatus = useJenkinsStatus();

  const kubeLabel = kubeStatus.data?.configured
    ? "Kubernetes · 已配置"
    : "Kubernetes";
  const jenkinsLabel =
    jenkinsStatus.data?.connected || jenkinsCfg.data?.configured
      ? "Jenkins · 已配置"
      : "Jenkins";

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6 text-[13px]">
      <div className="max-w-3xl space-y-1">
        <h1 className="text-base font-semibold text-foreground">凭证</h1>
        <p className="text-muted-foreground">
          配置本机连接信息。安装包不含账号；数据保存在{" "}
          <span className="font-mono text-[12px]">~/.lancer/</span>
        </p>
      </div>

      <div className="max-w-3xl">
        <PageTabsBar
          items={[
            { id: "kubernetes", label: kubeLabel },
            { id: "jenkins", label: jenkinsLabel },
          ]}
          value={tab}
          onChange={(id) => setTab(id as CredTab)}
        />
      </div>

      <div className="max-w-3xl">
        {tab === "kubernetes" ? <KubernetesCredentialCard /> : null}
        {tab === "jenkins" ? <JenkinsCredentialCard /> : null}
      </div>
    </div>
  );
}

function KubernetesCredentialCard() {
  const statusQuery = useKubeCredentialStatus();
  const yamlQuery = useSavedKubeconfigYaml();
  const importMutation = useImportKubeconfig();
  const setContextMutation = useSetKubePreferredContext();
  const connect = useConnectCluster();
  const disconnect = useDisconnectCluster();
  const connectedQuery = useConnectedClusters();
  const setKubeAutoConnect = useConnectionSessionStore((s) => s.setKubeAutoConnect);

  const [editorOpen, setEditorOpen] = useState(false);
  const [yaml, setYaml] = useState("");
  const [context, setContext] = useState("");
  const [namespace, setNamespace] = useState(KUBE_PREFERRED_FALLBACK_NAMESPACE);

  const status = statusQuery.data;
  const configured = status?.configured === true;
  const connected = (connectedQuery.data ?? [])[0] ?? null;
  const contexts = status?.contexts ?? [];

  useEffect(() => {
    if (!status) return;
    if (status.preferredContext) setContext(status.preferredContext);
    setNamespace(resolveWorkingNamespace(status.defaultNamespace));
  }, [status]);

  // 未配置时：主页面直接给编辑器；已配置时：弹层打开再灌入已存 YAML
  useEffect(() => {
    if (!configured) {
      setEditorOpen(true);
      return;
    }
    setEditorOpen(false);
  }, [configured]);

  const openEditor = async (seedFromSaved: boolean) => {
    if (seedFromSaved) {
      const result = await yamlQuery.refetch();
      setYaml(result.data?.yaml ?? "");
    } else {
      setYaml("");
    }
    setEditorOpen(true);
  };

  const disconnectOnly = async () => {
    if (!connected) return;
    try {
      await disconnect.mutateAsync(connected.id);
      setKubeAutoConnect(false);
      toast.success("已断开 Kubernetes 连接");
    } catch (err: unknown) {
      toast.error(formatAppError(err).message);
    }
  };

  const connectOnly = async () => {
    try {
      if (!status?.configured || !context || !status.absolutePath) {
        toast.error("请先配置 kubeconfig");
        return;
      }
      const workingNs = resolveWorkingNamespace(namespace);
      setNamespace(workingNs);
      await setContextMutation.mutateAsync({
        context,
        defaultNamespace: workingNs,
      });
      if (connected) {
        await disconnect.mutateAsync(connected.id);
      }
      setKubeAutoConnect(true);
      await connect.mutateAsync({
        context,
        kubeconfigPath: status.absolutePath,
        defaultNamespace: workingNs,
        readonly: false,
      });
      toast.success(`已连接 ${context}`);
    } catch (err: unknown) {
      toast.error(formatAppError(err).message);
    }
  };

  const saveYamlAndConnect = async () => {
    try {
      if (!yaml.trim()) {
        toast.error("请粘贴 kubeconfig YAML");
        return;
      }
      const workingNs = resolveWorkingNamespace(namespace);
      setNamespace(workingNs);
      const imported = await importMutation.mutateAsync({
        yaml,
        ...(context ? { preferredContext: context } : {}),
        defaultNamespace: workingNs,
      });
      const selectedContext =
        imported.preferredContext || imported.contexts[0]?.name || "";
      setContext(selectedContext);
      if (connected) {
        await disconnect.mutateAsync(connected.id);
      }
      setKubeAutoConnect(true);
      await connect.mutateAsync({
        context: selectedContext,
        kubeconfigPath: imported.absolutePath,
        defaultNamespace: workingNs,
        readonly: false,
      });
      setEditorOpen(false);
      toast.success(`已保存并连接 ${selectedContext}`);
    } catch (err: unknown) {
      toast.error(formatAppError(err).message);
    }
  };

  const busy =
    importMutation.isPending ||
    setContextMutation.isPending ||
    connect.isPending ||
    disconnect.isPending;

  return (
    <>
      <PanelCard
        title="Kubernetes"
        action={
          <span
            className={cn(
              "text-[11px]",
              configured ? "text-success" : "text-muted-foreground",
            )}
          >
            {configured ? "已配置" : "未配置"}
          </span>
        }
      >
        <div className="flex flex-col gap-3 p-4">
          {connected ? (
            <div className="flex items-start justify-between gap-3 rounded-md border border-border-subtle bg-surface-2/40 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-[12px] font-medium">当前连接</div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {connected.context} · {connected.kubeconfigPathDisplay}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={disconnect.isPending}
                onClick={() => void disconnectOnly()}
              >
                {disconnect.isPending ? "断开中…" : "断开"}
              </Button>
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-border-subtle px-3 py-2 text-[12px] text-muted-foreground">
              {configured ? "已保存本机配置，尚未连接" : "还没有 kubeconfig，请粘贴配置"}
            </p>
          )}

          {configured ? (
            <dl className="grid gap-2 rounded-md border border-border-subtle px-3 py-2.5 text-[12px] sm:grid-cols-2">
              <div>
                <dt className="text-[11px] text-muted-foreground">保存路径</dt>
                <dd className="mt-0.5 truncate font-mono text-[11px]" title={status?.pathDisplay}>
                  {status?.pathDisplay}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-muted-foreground">Context 数</dt>
                <dd className="mt-0.5 font-mono text-[11px]">{contexts.length}</dd>
              </div>
            </dl>
          ) : null}

          {contexts.length > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium">Context</span>
              <CompactSelect
                className="w-full"
                triggerClassName="w-full font-mono"
                size="md"
                value={context}
                onChange={(e) => setContext(e.target.value)}
              >
                {contexts.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                    {c.isCurrent ? " *" : ""}
                  </option>
                ))}
              </CompactSelect>
            </label>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium">默认 Namespace</span>
            <input
              className="h-9 rounded-md border border-border-subtle bg-white px-3 font-mono text-[12px] outline-none focus:border-primary"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder={KUBE_PREFERRED_FALLBACK_NAMESPACE}
            />
            <span className="text-[11px] text-muted-foreground">
              Rancher 项目 token 不要用 default，常用 {KUBE_PREFERRED_FALLBACK_NAMESPACE}
            </span>
          </label>

          <div className="flex flex-wrap gap-2 pt-1">
            {configured ? (
              <>
                <Button size="sm" disabled={busy || !context} onClick={() => void connectOnly()}>
                  {busy ? "处理中…" : "连接"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void openEditor(true)}
                >
                  查看 / 更换 kubeconfig
                </Button>
              </>
            ) : (
              <Button size="sm" disabled={busy} onClick={() => void openEditor(false)}>
                粘贴 kubeconfig
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={statusQuery.isFetching}
              onClick={() => void statusQuery.refetch()}
            >
              刷新状态
            </Button>
          </div>

          {statusQuery.isError ? (
            <p className="text-[12px] text-destructive">
              {formatAppError(statusQuery.error).message}
            </p>
          ) : null}
        </div>
      </PanelCard>

      {editorOpen ? (
        <KubeconfigEditorModal
          title={configured ? "查看 / 更换 kubeconfig" : "粘贴 kubeconfig"}
          yaml={yaml}
          onChange={setYaml}
          busy={busy}
          pathHint={status?.pathDisplay || "~/.lancer/kubeconfigs/default.yaml"}
          onClose={() => {
            if (configured) setEditorOpen(false);
          }}
          closeDisabled={!configured}
          onSave={() => void saveYamlAndConnect()}
        />
      ) : null}
    </>
  );
}

const YAML_GREEN_THEME = "lancer-yaml-green";

function KubeconfigEditorModal({
  title,
  yaml,
  onChange,
  busy,
  pathHint,
  onClose,
  closeDisabled,
  onSave,
}: {
  title: string;
  yaml: string;
  onChange: (v: string) => void;
  busy: boolean;
  pathHint: string;
  onClose: () => void;
  closeDisabled?: boolean;
  onSave: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[10vh] px-4"
      onClick={() => {
        if (!closeDisabled) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !closeDisabled) onClose();
      }}
      role="presentation"
    >
      <div
        className="flex max-h-[78vh] w-full max-w-[640px] flex-col overflow-hidden rounded-[10px] border border-border-subtle bg-white shadow-[0_12px_40px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border-subtle px-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-foreground">{title}</div>
          </div>
          <span className="hidden max-w-[240px] truncate font-mono text-[11px] text-muted-foreground sm:inline">
            {pathHint}
          </span>
          {!closeDisabled ? (
            <button
              type="button"
              className="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-[14px] text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              aria-label="关闭"
              disabled={busy}
              onClick={onClose}
            >
              ×
            </button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 bg-[#f4faf5]">
          <Suspense
            fallback={
              <p className="px-4 py-12 text-center text-[12px] text-muted-foreground">
                加载编辑器…
              </p>
            }
          >
            <MonacoEditor
              height="380px"
              language="yaml"
              theme={YAML_GREEN_THEME}
              value={yaml}
              onChange={(value) => onChange(value ?? "")}
              beforeMount={(monaco) => {
                monaco.editor.defineTheme(YAML_GREEN_THEME, {
                  base: "vs",
                  inherit: true,
                  rules: [
                    { token: "", foreground: "24352C" },
                    { token: "comment", foreground: "6B8F7A" },
                    { token: "string", foreground: "1F3D2E" },
                    { token: "number", foreground: "2F6B4F" },
                    { token: "keyword", foreground: "163528", fontStyle: "bold" },
                    { token: "type", foreground: "3D7A5C" },
                    { token: "key", foreground: "1A3326", fontStyle: "bold" },
                  ],
                  colors: {
                    "editor.background": "#F4FAF5",
                    "editor.foreground": "#24352C",
                    "editorLineNumber.foreground": "#9BB5A6",
                    "editorLineNumber.activeForeground": "#4A6B5A",
                    "editor.selectionBackground": "#CDE8D6",
                    "editor.inactiveSelectionBackground": "#E3F2E8",
                    "editor.lineHighlightBackground": "#EAF5EE",
                    "editorCursor.foreground": "#2F6B4F",
                    "editorGutter.background": "#EEF6F0",
                    "editorIndentGuide.background": "#D7E8DE",
                    "editorIndentGuide.activeBackground": "#A8C9B6",
                    "scrollbarSlider.background": "#00000014",
                    "scrollbarSlider.hoverBackground": "#00000022",
                  },
                });
              }}
              options={{
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
                fontSize: 12,
                fontFamily: "SF Mono, JetBrains Mono, Menlo, monospace",
                automaticLayout: true,
                tabSize: 2,
                lineNumbers: "on",
                renderLineHighlight: "line",
                padding: { top: 10, bottom: 10 },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                folding: true,
                scrollbar: {
                  verticalScrollbarSize: 6,
                  horizontalScrollbarSize: 6,
                },
              }}
            />
          </Suspense>
        </div>

        <div className="flex h-12 shrink-0 items-center gap-2 border-t border-border-subtle px-4">
          <p className="mr-auto truncate text-[11px] text-muted-foreground">
            YAML · 仅存本机 {pathHint}
          </p>
          {!closeDisabled ? (
            <Button size="sm" variant="secondary" disabled={busy} onClick={onClose}>
              取消
            </Button>
          ) : null}
          <Button size="sm" disabled={busy || !yaml.trim()} onClick={onSave}>
            {busy ? "保存中…" : "保存并连接"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function JenkinsCredentialCard() {
  const configQuery = useJenkinsLocalConfig();
  const saveMutation = useSaveJenkinsLocalConfig();
  const statusQuery = useJenkinsStatus();
  const connect = useConnectJenkins();
  const disconnect = useDisconnectJenkins();
  const setJenkinsAutoConnect = useConnectionSessionStore((s) => s.setJenkinsAutoConnect);

  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState(true);
  const [webhookPort, setWebhookPort] = useState("18765");

  const cfg = configQuery.data;
  const connected = statusQuery.data?.connected === true;

  useEffect(() => {
    if (!cfg) return;
    setBaseUrl(cfg.baseUrl);
    setUsername(cfg.username);
    setWebhookEnabled(cfg.webhookEnabled);
    setWebhookPort(String(cfg.webhookPort || 18765));
  }, [cfg]);

  const disconnectOnly = async () => {
    try {
      await disconnect.mutateAsync();
      setJenkinsAutoConnect(false);
      toast.success("已断开 Jenkins 连接");
    } catch (err: unknown) {
      toast.error(formatAppError(err).message);
    }
  };

  const connectOnly = async () => {
    try {
      if (!cfg?.configured) {
        toast.error("请先保存 Jenkins 配置");
        return;
      }
      setJenkinsAutoConnect(true);
      if (connected) {
        await disconnect.mutateAsync();
      }
      await connect.mutateAsync({});
      toast.success("已连接 Jenkins");
    } catch (err: unknown) {
      toast.error(formatAppError(err).message);
    }
  };

  const saveAndConnect = async () => {
    try {
      await saveMutation.mutateAsync({
        baseUrl,
        username,
        ...(apiToken.trim() ? { apiToken: apiToken.trim() } : {}),
        webhookEnabled,
        webhookPort: Number(webhookPort) || 18765,
      });
      setApiToken("");
      if (connected) {
        await disconnect.mutateAsync();
      }
      setJenkinsAutoConnect(true);
      await connect.mutateAsync({});
      toast.success("Jenkins 配置已保存并连接");
    } catch (err: unknown) {
      toast.error(formatAppError(err).message);
    }
  };

  const busy = saveMutation.isPending || connect.isPending || disconnect.isPending;

  return (
    <PanelCard
      title="Jenkins"
      action={
        <span
          className={cn(
            "text-[11px]",
            cfg?.configured ? "text-success" : "text-muted-foreground",
          )}
        >
          {cfg?.configured ? "已配置" : "未配置"}
        </span>
      }
    >
      <div className="flex flex-col gap-3 p-4">
        {connected ? (
          <div className="flex items-start justify-between gap-3 rounded-md border border-border-subtle bg-surface-2/40 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[12px] font-medium">当前连接</div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {statusQuery.data?.username} @ {statusQuery.data?.baseUrl}
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={disconnect.isPending}
              onClick={() => void disconnectOnly()}
            >
              {disconnect.isPending ? "断开中…" : "断开"}
            </Button>
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border-subtle px-3 py-2 text-[12px] text-muted-foreground">
            {cfg?.configured ? "已保存本机配置，尚未连接" : "还没有 Jenkins 配置"}
          </p>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium">Jenkins URL</span>
          <input
            className="h-9 rounded-md border border-border-subtle bg-white px-3 text-[12px] outline-none focus:border-primary"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://host:port/jenkins"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium">用户名</span>
          <input
            className="h-9 rounded-md border border-border-subtle bg-white px-3 text-[12px] outline-none focus:border-primary"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium">API Token</span>
          <input
            type="password"
            className="h-9 rounded-md border border-border-subtle bg-white px-3 text-[12px] outline-none focus:border-primary"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={cfg?.apiTokenSet ? "已保存，留空则不改" : "粘贴 API Token"}
            autoComplete="off"
          />
          <span className="text-[11px] text-muted-foreground">
            写入 {cfg?.pathDisplay || "~/.lancer/jenkins.json"}，读取时不回传明文 Token
          </span>
        </label>

        <label className="flex items-center gap-2 text-[12px]">
          <input
            type="checkbox"
            className="size-3.5"
            checked={webhookEnabled}
            onChange={(e) => setWebhookEnabled(e.target.checked)}
          />
          启用本机 Webhook 接收
        </label>
        {webhookEnabled ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium">Webhook 端口</span>
            <input
              className="h-9 w-32 rounded-md border border-border-subtle bg-white px-3 text-[12px] outline-none focus:border-primary"
              value={webhookPort}
              onChange={(e) => setWebhookPort(e.target.value)}
            />
          </label>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            disabled={busy || !cfg?.configured}
            onClick={() => void connectOnly()}
          >
            {connect.isPending ? "连接中…" : "连接"}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void saveAndConnect()}>
            {saveMutation.isPending ? "保存中…" : "保存并连接"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={configQuery.isFetching}
            onClick={() => void configQuery.refetch()}
          >
            刷新状态
          </Button>
        </div>
      </div>
    </PanelCard>
  );
}

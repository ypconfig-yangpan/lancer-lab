import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  applyJenkinsConfigForm,
  emptyConfigForm,
  JENKINS_CONFIG_SECTIONS,
  parseJenkinsConfigXml,
  type JenkinsConfigSectionId,
  type JenkinsJobConfigForm,
} from "@/capabilities/jenkins/config/jenkins-config-xml";
import {
  useJenkinsJobConfig,
  useUpdateJenkinsJobConfig,
} from "@/capabilities/jenkins/connect/use-jenkins-queries";
import { PanelCard } from "@/shared/dashboard-ui";
import { formatAppError } from "@/shared/lib/app-error";
import { cn } from "@/shared/lib/utils";
import { type ThemeMode, useWorkspaceStore } from "@/shared/stores/workspace-store";

const MonacoEditor = lazy(() => import("@monaco-editor/react"));

function resolveEditorTheme(theme: ThemeMode): "vs-dark" | "light" {
  if (theme === "dark") return "vs-dark";
  if (theme === "light") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "light";
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-9 rounded-md border border-border-subtle bg-white px-3 text-[13px] outline-none focus:border-primary",
        props.className,
      )}
    />
  );
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-[88px] rounded-md border border-border-subtle bg-white px-3 py-2 text-[13px] outline-none focus:border-primary",
        props.className,
      )}
    />
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-border-subtle">
      <label className="flex cursor-pointer items-center gap-2 px-3 py-2.5 text-[13px]">
        <input
          type="checkbox"
          className="size-3.5"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="font-medium">{label}</span>
      </label>
      {checked && children ? (
        <div className="space-y-3 border-t border-border-subtle bg-surface-2/40 px-3 py-3">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium">{title}</p>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">当前无配置项</p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-md border border-border-subtle">
          {items.map((item, i) => (
            <li key={`${item}-${i}`} className="px-3 py-2 font-mono text-[12px]">
              {item}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-muted-foreground">
        复杂插件步骤请到「高级 XML」编辑，或后续再做可视化。
      </p>
    </div>
  );
}

function patchForm(
  form: JenkinsJobConfigForm,
  patch: Partial<JenkinsJobConfigForm>,
): JenkinsJobConfigForm {
  return { ...form, ...patch };
}

/** Jenkins 风格图形化 Job 配置（表单为主，XML 为高级兜底）。 */
export function JenkinsJobConfigPane({ jobFullName }: { jobFullName: string }) {
  const theme = useWorkspaceStore((s) => s.theme);
  const editorTheme = useMemo(() => resolveEditorTheme(theme), [theme]);
  const configQuery = useJenkinsJobConfig(jobFullName, true);
  const saveMutation = useUpdateJenkinsJobConfig();

  const [section, setSection] = useState<JenkinsConfigSectionId>("general");
  const [sourceXml, setSourceXml] = useState("");
  const [form, setForm] = useState<JenkinsJobConfigForm>(emptyConfigForm);
  const [xmlDraft, setXmlDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const loadFromXml = (xml: string) => {
    try {
      const parsed = parseJenkinsConfigXml(xml);
      setForm(parsed);
      setSourceXml(xml);
      setXmlDraft(xml);
      setParseError(null);
      setDirty(false);
    } catch (err: unknown) {
      setParseError(err instanceof Error ? err.message : String(err));
      setSourceXml(xml);
      setXmlDraft(xml);
    }
  };

  useEffect(() => {
    if (configQuery.data?.xml == null) return;
    if (!dirty) loadFromXml(configQuery.data.xml);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在远端 XML 变化且未脏时同步
  }, [configQuery.data?.xml]);

  const update = (patch: Partial<JenkinsJobConfigForm>) => {
    setForm((prev) => patchForm(prev, patch));
    setDirty(true);
  };

  const save = async () => {
    try {
      let xmlToSave = sourceXml;
      if (section === "xml") {
        xmlToSave = xmlDraft;
        // 若 XML 可解析，同步表单
        try {
          setForm(parseJenkinsConfigXml(xmlDraft));
        } catch {
          /* 允许直接保存原始 XML */
        }
      } else {
        xmlToSave = applyJenkinsConfigForm(sourceXml, form);
        setXmlDraft(xmlToSave);
      }
      await saveMutation.mutateAsync({ jobFullName, xml: xmlToSave });
      setSourceXml(xmlToSave);
      setDirty(false);
      toast.success("配置已保存到 Jenkins");
    } catch (err: unknown) {
      toast.error(formatAppError(err).message);
    }
  };

  const reload = async () => {
    setDirty(false);
    const result = await configQuery.refetch();
    if (result.data?.xml != null) loadFromXml(result.data.xml);
  };

  if (configQuery.isLoading && !configQuery.data) {
    return (
      <PanelCard title="配置">
        <p className="px-4 py-6 text-[12px] text-muted-foreground">加载配置…</p>
      </PanelCard>
    );
  }

  if (configQuery.isError && !configQuery.data) {
    return (
      <PanelCard title="配置">
        <div className="flex flex-col items-start gap-2 px-4 py-6 text-[12px]">
          <p className="text-destructive">{formatAppError(configQuery.error).message}</p>
          <Button size="sm" variant="secondary" onClick={() => void reload()}>
            重试
          </Button>
        </div>
      </PanelCard>
    );
  }

  const kindLabel =
    form.jobKind === "maven"
      ? "Maven"
      : form.jobKind === "freestyle"
        ? "Freestyle"
        : form.jobKind === "pipeline"
          ? "Pipeline"
          : form.rootTag;

  return (
    <PanelCard
      title="配置"
      action={
        <div className="flex items-center gap-2">
          <label className="mr-2 flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">Enabled</span>
            <button
              type="button"
              role="switch"
              aria-checked={!form.disabled}
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors",
                form.disabled ? "bg-muted-foreground/30" : "bg-primary",
              )}
              onClick={() => update({ disabled: !form.disabled })}
            >
              <span
                className={cn(
                  "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
                  form.disabled ? "left-0.5" : "left-[18px]",
                )}
              />
            </button>
          </label>
          {dirty ? (
            <span className="text-[11px] text-warning">未保存</span>
          ) : (
            <span className="text-[11px] text-muted-foreground">{kindLabel}</span>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={saveMutation.isPending || configQuery.isFetching}
            onClick={() => void reload()}
          >
            重新加载
          </Button>
          <Button
            size="sm"
            disabled={!dirty || saveMutation.isPending}
            onClick={() => void save()}
          >
            {saveMutation.isPending ? "保存中…" : "保存"}
          </Button>
        </div>
      }
    >
      {parseError ? (
        <p className="border-b border-border-subtle px-4 py-2 text-[12px] text-destructive">
          {parseError} · 可改用「高级 XML」
        </p>
      ) : null}

      <div className="grid min-h-[480px] lg:grid-cols-[200px_1fr]">
        <nav className="border-b border-border-subtle bg-surface-2/30 lg:border-r lg:border-b-0">
          <ul className="py-1">
            {JENKINS_CONFIG_SECTIONS.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={cn(
                    "w-full px-4 py-2 text-left text-[13px]",
                    section === item.id
                      ? "bg-white font-semibold text-foreground shadow-[inset_3px_0_0_0_var(--color-primary)]"
                      : "text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                  )}
                  onClick={() => {
                    if (section === "xml" && item.id !== "xml" && dirty) {
                      // 从 XML 切回表单时尝试解析
                      try {
                        setForm(parseJenkinsConfigXml(xmlDraft));
                        setSourceXml(xmlDraft);
                        setParseError(null);
                      } catch (err: unknown) {
                        setParseError(
                          err instanceof Error ? err.message : "XML 无效，仍停留在高级编辑",
                        );
                        return;
                      }
                    }
                    if (section !== "xml" && item.id === "xml") {
                      try {
                        const next = applyJenkinsConfigForm(sourceXml, form);
                        setXmlDraft(next);
                        setSourceXml(next);
                      } catch {
                        /* keep previous xml draft */
                      }
                    }
                    setSection(item.id);
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 p-4">
          {section === "general" ? (
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              <Field label="描述">
                <TextArea
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="Job 描述…"
                />
              </Field>
              <CheckRow
                checked={form.discardOldBuilds}
                onChange={(v) => update({ discardOldBuilds: v })}
                label="Discard old builds"
              >
                <Field label="策略">
                  <TextInput value="Log Rotation" readOnly className="bg-surface-2" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="保持构建的天数">
                    <TextInput
                      value={form.daysToKeep}
                      onChange={(e) => update({ daysToKeep: e.target.value })}
                      placeholder="空或 -1 表示不限"
                    />
                  </Field>
                  <Field label="保持构建的最大个数">
                    <TextInput
                      value={form.numToKeep}
                      onChange={(e) => update({ numToKeep: e.target.value })}
                      placeholder="例如 3"
                    />
                  </Field>
                </div>
              </CheckRow>
              <CheckRow
                checked={form.githubProject}
                onChange={(v) => update({ githubProject: v })}
                label="GitHub 项目"
              >
                <Field label="Project url">
                  <TextInput
                    value={form.githubProjectUrl}
                    onChange={(e) => update({ githubProjectUrl: e.target.value })}
                    placeholder="https://github.com/org/repo"
                  />
                </Field>
              </CheckRow>
            </div>
          ) : null}

          {section === "scm" ? (
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              <Field label="源码管理">
                <select
                  className="h-9 rounded-md border border-border-subtle bg-white px-3 text-[13px]"
                  value={form.scmKind}
                  onChange={(e) =>
                    update({
                      scmKind: e.target.value as JenkinsJobConfigForm["scmKind"],
                    })
                  }
                >
                  <option value="none">None</option>
                  <option value="git">Git</option>
                  <option value="other">Other（请用高级 XML）</option>
                </select>
              </Field>
              {form.scmKind === "git" ? (
                <>
                  <Field label="Repository URL">
                    <TextInput
                      value={form.gitUrl}
                      onChange={(e) => update({ gitUrl: e.target.value })}
                    />
                  </Field>
                  <Field label="Credentials Id" hint="Jenkins 凭据 ID，可留空">
                    <TextInput
                      value={form.gitCredentialsId}
                      onChange={(e) => update({ gitCredentialsId: e.target.value })}
                    />
                  </Field>
                  <Field label="Branches to build">
                    <TextInput
                      value={form.gitBranch}
                      onChange={(e) => update({ gitBranch: e.target.value })}
                      placeholder="*/master"
                    />
                  </Field>
                </>
              ) : null}
              {form.scmKind === "other" ? (
                <p className="text-[12px] text-muted-foreground">
                  当前 SCM 类型非 Git，请到「高级 XML」修改。
                </p>
              ) : null}
            </div>
          ) : null}

          {section === "triggers" ? (
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              <CheckRow
                checked={form.scmTriggerEnabled}
                onChange={(v) => update({ scmTriggerEnabled: v })}
                label="Poll SCM"
              >
                <Field label="Schedule" hint="Cron，例如 H/5 * * * *">
                  <TextInput
                    value={form.scmTriggerSpec}
                    onChange={(e) => update({ scmTriggerSpec: e.target.value })}
                    className="font-mono"
                  />
                </Field>
              </CheckRow>
              <CheckRow
                checked={form.timerTriggerEnabled}
                onChange={(v) => update({ timerTriggerEnabled: v })}
                label="Build periodically"
              >
                <Field label="Schedule">
                  <TextInput
                    value={form.timerTriggerSpec}
                    onChange={(e) => update({ timerTriggerSpec: e.target.value })}
                    className="font-mono"
                  />
                </Field>
              </CheckRow>
            </div>
          ) : null}

          {section === "environment" ? (
            <div className="mx-auto max-w-2xl">
              <SummaryList title="Build Environment / Wrappers" items={form.wrapperSummary} />
            </div>
          ) : null}

          {section === "preSteps" ? (
            <div className="mx-auto max-w-2xl">
              <SummaryList title="Pre Steps" items={form.preStepSummary} />
            </div>
          ) : null}

          {section === "build" ? (
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              {form.jobKind === "maven" || form.rootTag.toLowerCase().includes("maven") ? (
                <>
                  <Field label="Root POM">
                    <TextInput
                      value={form.rootPom}
                      onChange={(e) => update({ rootPom: e.target.value })}
                    />
                  </Field>
                  <Field label="Goals and options">
                    <TextInput
                      value={form.goals}
                      onChange={(e) => update({ goals: e.target.value })}
                      placeholder="clean package"
                      className="font-mono"
                    />
                  </Field>
                  <Field label="Maven Version" hint="Jenkins 全局工具名，可留空用默认">
                    <TextInput
                      value={form.mavenName}
                      onChange={(e) => update({ mavenName: e.target.value })}
                    />
                  </Field>
                  <Field label="MAVEN_OPTS">
                    <TextInput
                      value={form.mavenOpts}
                      onChange={(e) => update({ mavenOpts: e.target.value })}
                      className="font-mono"
                    />
                  </Field>
                </>
              ) : form.freestyleBuilders.length > 0 ? (
                <SummaryList title="Build Steps" items={form.freestyleBuilders} />
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  当前 Job 类型（{kindLabel}）的 Build 步骤请到「高级 XML」编辑。
                </p>
              )}
            </div>
          ) : null}

          {section === "postSteps" ? (
            <div className="mx-auto max-w-2xl">
              <SummaryList title="Post Steps" items={form.postStepSummary} />
            </div>
          ) : null}

          {section === "buildSettings" ? (
            <div className="mx-auto flex max-w-2xl flex-col gap-4">
              <CheckRow
                checked={form.concurrentBuild}
                onChange={(v) => update({ concurrentBuild: v })}
                label="Execute concurrent builds if necessary"
              />
            </div>
          ) : null}

          {section === "publishers" ? (
            <div className="mx-auto max-w-2xl">
              <SummaryList title="构建后操作" items={form.publisherSummary} />
            </div>
          ) : null}

          {section === "xml" ? (
            <div className="flex h-full min-h-[420px] flex-col">
              <p className="mb-2 text-[11px] text-muted-foreground">
                直接编辑 config.xml。保存会整份提交到 Jenkins。
              </p>
              <Suspense
                fallback={
                  <p className="text-[12px] text-muted-foreground">加载编辑器…</p>
                }
              >
                <MonacoEditor
                  height="420px"
                  language="xml"
                  theme={editorTheme}
                  value={xmlDraft}
                  onChange={(value) => {
                    setXmlDraft(value ?? "");
                    setDirty(true);
                  }}
                  options={{
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    fontSize: 12,
                    fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace",
                    automaticLayout: true,
                    tabSize: 2,
                  }}
                />
              </Suspense>
            </div>
          ) : null}
        </div>
      </div>
    </PanelCard>
  );
}

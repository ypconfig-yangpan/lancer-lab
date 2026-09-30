/**
 * Jenkins Job config.xml ↔ 表单模型（浏览器 DOMParser）。
 * 覆盖 Maven / Freestyle 常见字段；未知节点原样保留。
 */

export type JenkinsConfigSectionId =
  | "general"
  | "scm"
  | "triggers"
  | "environment"
  | "preSteps"
  | "build"
  | "postSteps"
  | "buildSettings"
  | "publishers"
  | "xml";

export const JENKINS_CONFIG_SECTIONS: {
  id: JenkinsConfigSectionId;
  label: string;
}[] = [
  { id: "general", label: "General" },
  { id: "scm", label: "源码管理" },
  { id: "triggers", label: "Triggers" },
  { id: "environment", label: "Environment" },
  { id: "preSteps", label: "Pre Steps" },
  { id: "build", label: "Build" },
  { id: "postSteps", label: "Post Steps" },
  { id: "buildSettings", label: "构建设置" },
  { id: "publishers", label: "构建后操作" },
  { id: "xml", label: "高级 XML" },
];

export interface JenkinsJobConfigForm {
  rootTag: string;
  jobKind: "maven" | "freestyle" | "pipeline" | "unknown";
  disabled: boolean;
  description: string;
  discardOldBuilds: boolean;
  daysToKeep: string;
  numToKeep: string;
  githubProject: boolean;
  githubProjectUrl: string;
  scmKind: "git" | "none" | "other";
  gitUrl: string;
  gitCredentialsId: string;
  gitBranch: string;
  scmTriggerEnabled: boolean;
  scmTriggerSpec: string;
  timerTriggerEnabled: boolean;
  timerTriggerSpec: string;
  concurrentBuild: boolean;
  rootPom: string;
  goals: string;
  mavenName: string;
  mavenOpts: string;
  /** Freestyle shell / batch 摘要 */
  freestyleBuilders: string[];
  preStepSummary: string[];
  postStepSummary: string[];
  publisherSummary: string[];
  wrapperSummary: string[];
}

function textOf(parent: Element, tag: string): string {
  const el = parent.getElementsByTagName(tag)[0];
  return el?.textContent ?? "";
}

function setText(parent: Element, tag: string, value: string, doc: Document) {
  let el = parent.getElementsByTagName(tag)[0];
  if (!el) {
    el = doc.createElement(tag);
    parent.appendChild(el);
  }
  el.textContent = value;
}

function childSummaries(parent: Element | null | undefined): string[] {
  if (!parent) return [];
  return [...parent.children].map((c) => {
    const cls = c.getAttribute("class") || c.tagName;
    const short = cls.split(".").pop() || cls;
    return short;
  });
}

function detectJobKind(rootTag: string): JenkinsJobConfigForm["jobKind"] {
  const t = rootTag.toLowerCase();
  if (t.includes("maven") || t === "maven2-moduleset") return "maven";
  if (t.includes("flow") || t.includes("workflow") || t.includes("pipeline")) return "pipeline";
  if (t.includes("project") || t.includes("freestyle")) return "freestyle";
  return "unknown";
}

function findBuildDiscarder(root: Element): Element | null {
  const props = root.getElementsByTagName("properties")[0];
  if (!props) return null;
  for (const child of props.children) {
    if (child.tagName.includes("BuildDiscarderProperty")) {
      return child;
    }
  }
  return null;
}

function findGitRemote(root: Element): Element | null {
  const remotes = root.getElementsByTagName("userRemoteConfigs")[0];
  if (!remotes) return null;
  return remotes.children[0] ?? null;
}

function findGitBranch(root: Element): Element | null {
  const branches = root.getElementsByTagName("branches")[0];
  if (!branches) return null;
  const spec = branches.children[0];
  return spec ?? null;
}

export function parseJenkinsConfigXml(xml: string): JenkinsJobConfigForm {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("config.xml 解析失败");
  }
  const root = doc.documentElement;
  const rootTag = root.tagName;
  const jobKind = detectJobKind(rootTag);

  const discard = findBuildDiscarder(root);
  const strategy = discard?.getElementsByTagName("strategy")[0] ?? null;

  const scm = root.getElementsByTagName("scm")[0];
  const scmClass = scm?.getAttribute("class") ?? "";
  let scmKind: JenkinsJobConfigForm["scmKind"] = "other";
  if (!scm || scmClass.includes("NullSCM")) scmKind = "none";
  else if (scmClass.includes("GitSCM") || scm.getElementsByTagName("userRemoteConfigs").length)
    scmKind = "git";

  const remote = findGitRemote(root);
  const branchEl = findGitBranch(root);

  const triggers = root.getElementsByTagName("triggers")[0];
  let scmTriggerEnabled = false;
  let scmTriggerSpec = "H/5 * * * *";
  let timerTriggerEnabled = false;
  let timerTriggerSpec = "H H * * *";
  if (triggers) {
    for (const t of triggers.children) {
      const name = t.tagName;
      if (name.includes("SCMTrigger")) {
        scmTriggerEnabled = true;
        scmTriggerSpec = textOf(t, "spec") || scmTriggerSpec;
      }
      if (name.includes("TimerTrigger")) {
        timerTriggerEnabled = true;
        timerTriggerSpec = textOf(t, "spec") || timerTriggerSpec;
      }
    }
  }

  const githubProp = [...(root.getElementsByTagName("properties")[0]?.children ?? [])].find((c) =>
    c.tagName.includes("GithubProjectProperty"),
  );
  const builders = root.getElementsByTagName("builders")[0];
  const freestyleBuilders = childSummaries(builders);

  return {
    rootTag,
    jobKind,
    disabled: textOf(root, "disabled") === "true",
    description: textOf(root, "description"),
    discardOldBuilds: !!discard,
    daysToKeep: strategy ? textOf(strategy, "daysToKeep") : "",
    numToKeep: strategy ? textOf(strategy, "numToKeep") : "3",
    githubProject: !!githubProp,
    githubProjectUrl: githubProp ? textOf(githubProp, "projectUrl") : "",
    scmKind,
    gitUrl: remote ? textOf(remote, "url") : "",
    gitCredentialsId: remote ? textOf(remote, "credentialsId") : "",
    gitBranch: branchEl ? textOf(branchEl, "name") : "*/master",
    scmTriggerEnabled,
    scmTriggerSpec,
    timerTriggerEnabled,
    timerTriggerSpec,
    concurrentBuild: textOf(root, "concurrentBuild") === "true",
    rootPom: textOf(root, "rootPOM") || "pom.xml",
    goals: textOf(root, "goals"),
    mavenName: textOf(root, "mavenName"),
    mavenOpts: textOf(root, "mavenOpts"),
    freestyleBuilders,
    preStepSummary: childSummaries(root.getElementsByTagName("prebuilders")[0]),
    postStepSummary: childSummaries(root.getElementsByTagName("postbuilders")[0]),
    publisherSummary: childSummaries(root.getElementsByTagName("publishers")[0]),
    wrapperSummary: childSummaries(root.getElementsByTagName("buildWrappers")[0]),
  };
}

/**
 * 把表单写回 XML：只改认识的字段，其余节点保留。
 */
export function applyJenkinsConfigForm(xml: string, form: JenkinsJobConfigForm): string {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("config.xml 解析失败，无法保存");
  }
  const root = doc.documentElement;

  setText(root, "description", form.description, doc);
  setText(root, "disabled", form.disabled ? "true" : "false", doc);
  setText(root, "concurrentBuild", form.concurrentBuild ? "true" : "false", doc);

  // Build discarder
  let props = root.getElementsByTagName("properties")[0];
  if (!props) {
    props = doc.createElement("properties");
    // insert early if possible
    const keep = root.getElementsByTagName("keepDependencies")[0];
    if (keep?.nextSibling) {
      root.insertBefore(props, keep.nextSibling);
    } else {
      root.appendChild(props);
    }
  }

  const existingDiscard = findBuildDiscarder(root);
  if (form.discardOldBuilds) {
    let discard = existingDiscard;
    if (!discard) {
      discard = doc.createElement("jenkins.model.BuildDiscarderProperty");
      props.appendChild(discard);
    }
    let strategy = discard.getElementsByTagName("strategy")[0];
    if (!strategy) {
      strategy = doc.createElement("strategy");
      strategy.setAttribute("class", "hudson.tasks.LogRotator");
      discard.appendChild(strategy);
    }
    setText(strategy, "daysToKeep", form.daysToKeep.trim() || "-1", doc);
    setText(strategy, "numToKeep", form.numToKeep.trim() || "-1", doc);
    if (!strategy.getElementsByTagName("artifactDaysToKeep")[0]) {
      setText(strategy, "artifactDaysToKeep", "-1", doc);
    }
    if (!strategy.getElementsByTagName("artifactNumToKeep")[0]) {
      setText(strategy, "artifactNumToKeep", "-1", doc);
    }
  } else if (existingDiscard) {
    existingDiscard.remove();
  }

  // GitHub project property
  const githubExisting = [...props.children].find((c) =>
    c.tagName.includes("GithubProjectProperty"),
  );
  if (form.githubProject) {
    let gh = githubExisting;
    if (!gh) {
      gh = doc.createElement("com.coravy.hudson.plugins.github.GithubProjectProperty");
      props.appendChild(gh);
    }
    setText(gh, "projectUrl", form.githubProjectUrl, doc);
  } else if (githubExisting) {
    githubExisting.remove();
  }

  // SCM Git
  if (form.scmKind === "git") {
    let scm = root.getElementsByTagName("scm")[0];
    if (!scm || scm.getAttribute("class")?.includes("NullSCM")) {
      if (scm) scm.remove();
      scm = doc.createElement("scm");
      scm.setAttribute("class", "hudson.plugins.git.GitSCM");
      const afterDesc = root.getElementsByTagName("description")[0];
      if (afterDesc?.nextSibling) root.insertBefore(scm, afterDesc.nextSibling);
      else root.appendChild(scm);
      setText(scm, "configVersion", "2", doc);
      const remotes = doc.createElement("userRemoteConfigs");
      const remote = doc.createElement("hudson.plugins.git.UserRemoteConfig");
      remotes.appendChild(remote);
      scm.appendChild(remotes);
      const branches = doc.createElement("branches");
      const branch = doc.createElement("hudson.plugins.git.BranchSpec");
      branches.appendChild(branch);
      scm.appendChild(branches);
      setText(scm, "doGenerateSubmoduleConfigurations", "false", doc);
      scm.appendChild(doc.createElement("submoduleCfg"));
      scm.appendChild(doc.createElement("extensions"));
    }
    const remote = findGitRemote(root);
    const branchEl = findGitBranch(root);
    if (remote) {
      setText(remote, "url", form.gitUrl, doc);
      if (form.gitCredentialsId.trim()) {
        setText(remote, "credentialsId", form.gitCredentialsId, doc);
      } else {
        const cred = remote.getElementsByTagName("credentialsId")[0];
        cred?.remove();
      }
    }
    if (branchEl) {
      setText(branchEl, "name", form.gitBranch || "*/master", doc);
    }
  }

  // Triggers
  let triggers = root.getElementsByTagName("triggers")[0];
  if (!triggers) {
    triggers = doc.createElement("triggers");
    root.appendChild(triggers);
  }
  // remove known triggers then re-add
  for (const t of [...triggers.children]) {
    if (t.tagName.includes("SCMTrigger") || t.tagName.includes("TimerTrigger")) {
      t.remove();
    }
  }
  if (form.scmTriggerEnabled) {
    const t = doc.createElement("hudson.triggers.SCMTrigger");
    setText(t, "spec", form.scmTriggerSpec || "H/5 * * * *", doc);
    setText(t, "ignorePostCommitHooks", "false", doc);
    triggers.appendChild(t);
  }
  if (form.timerTriggerEnabled) {
    const t = doc.createElement("hudson.triggers.TimerTrigger");
    setText(t, "spec", form.timerTriggerSpec || "H H * * *", doc);
    triggers.appendChild(t);
  }

  // Maven build
  if (form.jobKind === "maven" || root.tagName.toLowerCase().includes("maven")) {
    setText(root, "rootPOM", form.rootPom || "pom.xml", doc);
    setText(root, "goals", form.goals, doc);
    if (form.mavenName) setText(root, "mavenName", form.mavenName, doc);
    setText(root, "mavenOpts", form.mavenOpts, doc);
  }

  // Prefer original XML declaration if present
  const body = new XMLSerializer().serializeToString(doc);
  const declMatch = xml.match(/^<\?xml[^?]*\?>\s*/);
  if (declMatch) {
    // serializeToString may omit or alter declaration
    const withoutDecl = body.replace(/^<\?xml[^?]*\?>\s*/, "");
    return `${declMatch[0]}${withoutDecl}`;
  }
  return body;
}

export function emptyConfigForm(): JenkinsJobConfigForm {
  return {
    rootTag: "project",
    jobKind: "unknown",
    disabled: false,
    description: "",
    discardOldBuilds: false,
    daysToKeep: "",
    numToKeep: "3",
    githubProject: false,
    githubProjectUrl: "",
    scmKind: "none",
    gitUrl: "",
    gitCredentialsId: "",
    gitBranch: "*/master",
    scmTriggerEnabled: false,
    scmTriggerSpec: "H/5 * * * *",
    timerTriggerEnabled: false,
    timerTriggerSpec: "H H * * *",
    concurrentBuild: false,
    rootPom: "pom.xml",
    goals: "",
    mavenName: "",
    mavenOpts: "",
    freestyleBuilders: [],
    preStepSummary: [],
    postStepSummary: [],
    publisherSummary: [],
    wrapperSummary: [],
  };
}

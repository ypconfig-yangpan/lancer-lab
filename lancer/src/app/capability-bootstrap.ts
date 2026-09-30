import { PluginContextFactory } from "@/plugin-kernel/context";
import { PlatformServices } from "@/plugin-kernel/platform/services";
import { activateCredentialsCapability } from "@/capabilities/connections/activate";
import { activateDockerCapability } from "@/capabilities/docker/activate";
import { activateJenkinsCapability } from "@/capabilities/jenkins/activate";
import {
  activateKubernetesCapability,
  deactivateKubernetesCapability,
} from "@/capabilities/kubernetes/activate";
import { ShellModuleRegistry } from "@/shell/module-registry";
import type { ActivityContribution } from "@/shell/types";

export interface ShellRuntime {
  readonly platform: PlatformServices;
  readonly modules: ShellModuleRegistry;
}

const CREDENTIALS_ACTIVITIES: ActivityContribution[] = [
  {
    id: "credentials",
    title: "凭证",
    description: "本机连接配置",
    icon: "key",
    order: 5,
  },
];

const KUBERNETES_ACTIVITIES: ActivityContribution[] = [
  {
    id: "kubernetes",
    title: "Kubernetes",
    description: "Clusters & workloads",
    icon: "boxes",
    order: 10,
  },
];

const DOCKER_ACTIVITIES: ActivityContribution[] = [
  {
    id: "docker",
    title: "Docker",
    description: "Local engine & containers",
    icon: "container",
    order: 20,
  },
];

const JENKINS_ACTIVITIES: ActivityContribution[] = [
  {
    id: "jenkins",
    title: "Jenkins",
    description: "Build & CI",
    icon: "hammer",
    order: 30,
  },
];

/**
 * Desktop capability composition root.
 * Static ShellModuleRegistry — no Manifest catalog, no PluginManager, no apply.
 */
export function createDesktopShellRuntime(): ShellRuntime {
  const platform = new PlatformServices();
  const modules = new ShellModuleRegistry(platform, new PluginContextFactory());

  modules.register({
    moduleId: "credentials",
    name: "凭证",
    enabled: true,
    activities: CREDENTIALS_ACTIVITIES,
    activate(context) {
      activateCredentialsCapability(context);
    },
  });

  modules.register({
    moduleId: "kubernetes",
    name: "Kubernetes",
    enabled: true,
    activities: KUBERNETES_ACTIVITIES,
    activate(context) {
      activateKubernetesCapability(context);
    },
    deactivate() {
      deactivateKubernetesCapability();
    },
  });

  modules.register({
    moduleId: "docker",
    name: "Docker",
    enabled: true,
    activities: DOCKER_ACTIVITIES,
    activate(context) {
      activateDockerCapability(context);
    },
  });

  modules.register({
    moduleId: "jenkins",
    name: "Jenkins",
    enabled: true,
    activities: JENKINS_ACTIVITIES,
    activate(context) {
      activateJenkinsCapability(context);
    },
  });

  return { platform, modules };
}

/** @deprecated use createDesktopShellRuntime */
export const createDesktopPluginRuntime = createDesktopShellRuntime;

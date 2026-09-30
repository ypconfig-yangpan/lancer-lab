import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCredentialsProfileApi } from "@/native/credentials-profile";
import { clusterKeys } from "@/capabilities/kubernetes/connect/query-keys";

const api = createCredentialsProfileApi();

export const credentialsKeys = {
  all: ["credentials"] as const,
  kube: () => [...credentialsKeys.all, "kube"] as const,
  kubeYaml: () => [...credentialsKeys.all, "kubeYaml"] as const,
  jenkins: () => [...credentialsKeys.all, "jenkins"] as const,
};

export function useKubeCredentialStatus(enabled = true) {
  return useQuery({
    queryKey: credentialsKeys.kube(),
    queryFn: () => api.getKubeStatus(),
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
}

export function useSavedKubeconfigYaml(enabled = true) {
  return useQuery({
    queryKey: credentialsKeys.kubeYaml(),
    queryFn: () => api.getKubeconfigYaml(),
    enabled,
    staleTime: 10_000,
    retry: false,
  });
}

export function useJenkinsLocalConfig(enabled = true) {
  return useQuery({
    queryKey: credentialsKeys.jenkins(),
    queryFn: () => api.getJenkinsConfig(),
    enabled,
    staleTime: 10_000,
    retry: false,
  });
}

export function useImportKubeconfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      yaml: string;
      preferredContext?: string;
      defaultNamespace?: string;
    }) => api.importKubeconfig(input),
    onSuccess: async (data) => {
      qc.setQueryData(credentialsKeys.kube(), {
        configured: data.contexts.length > 0,
        pathDisplay: data.pathDisplay,
        absolutePath: data.absolutePath,
        preferredContext: data.preferredContext,
        defaultNamespace: null,
        contexts: data.contexts,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: credentialsKeys.kube() }),
        qc.invalidateQueries({ queryKey: credentialsKeys.kubeYaml() }),
        qc.invalidateQueries({ queryKey: clusterKeys.all }),
      ]);
    },
  });
}

export function useSetKubePreferredContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { context: string; defaultNamespace?: string }) =>
      api.setKubeContext(input),
    onSuccess: async (data) => {
      qc.setQueryData(credentialsKeys.kube(), data);
    },
  });
}

export function useSaveJenkinsLocalConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      baseUrl: string;
      username: string;
      apiToken?: string;
      webhookEnabled?: boolean;
      webhookPort?: number;
      webhookToken?: string | null;
    }) => api.saveJenkinsConfig(input),
    onSuccess: async (data) => {
      qc.setQueryData(credentialsKeys.jenkins(), data);
    },
  });
}

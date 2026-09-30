import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { jenkinsApi } from "@/capabilities/jenkins/api";
import { optimisticQueueItem, parseQueueItemId } from "@/capabilities/jenkins/queue-optimistic";

export const jenkinsKeys = {
  all: ["jenkins"] as const,
  status: () => [...jenkinsKeys.all, "status"] as const,
  jobs: () => [...jenkinsKeys.all, "jobs"] as const,
  builds: (jobFullName: string) => [...jenkinsKeys.all, "builds", jobFullName] as const,
  job: (jobFullName: string) => [...jenkinsKeys.all, "job", jobFullName] as const,
  jobConfig: (jobFullName: string) => [...jenkinsKeys.all, "jobConfig", jobFullName] as const,
  build: (jobFullName: string, number: number) =>
    [...jenkinsKeys.all, "build", jobFullName, number] as const,
  executors: () => [...jenkinsKeys.all, "executors"] as const,
  queue: () => [...jenkinsKeys.all, "queue"] as const,
};

export function useJenkinsStatus(enabled = true) {
  return useQuery({
    queryKey: jenkinsKeys.status(),
    queryFn: () => jenkinsApi.status(),
    enabled,
    staleTime: 10_000,
    retry: false,
  });
}

export function useConnectJenkins() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input?: { configPath?: string }) => jenkinsApi.connect(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: jenkinsKeys.all });
    },
  });
}

export function useDisconnectJenkins() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => jenkinsApi.disconnect(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: jenkinsKeys.all });
    },
  });
}

export function useJenkinsJobs(enabled = true, hot = false) {
  return useQuery({
    queryKey: jenkinsKeys.jobs(),
    queryFn: () => jenkinsApi.listJobs(),
    enabled,
    staleTime: hot ? 0 : 15_000,
    refetchInterval: hot ? 2_500 : 20_000,
    retry: false,
  });
}

export function useJenkinsBuilds(jobFullName: string | null, enabled = true, hot = false) {
  return useQuery({
    queryKey: jenkinsKeys.builds(jobFullName ?? ""),
    queryFn: () => {
      if (!jobFullName) {
        return Promise.reject(new Error("job not selected"));
      }
      return jenkinsApi.listBuilds({ jobFullName, limit: 30 });
    },
    enabled: enabled && !!jobFullName,
    staleTime: hot ? 0 : 10_000,
    refetchInterval: hot ? 2_500 : 15_000,
    retry: false,
  });
}

export function useJenkinsJobDetail(jobFullName: string | null, enabled = true) {
  return useQuery({
    queryKey: jenkinsKeys.job(jobFullName ?? ""),
    queryFn: () => {
      if (!jobFullName) {
        return Promise.reject(new Error("job not selected"));
      }
      return jenkinsApi.getJob(jobFullName);
    },
    enabled: enabled && !!jobFullName,
    staleTime: 30_000,
    retry: false,
  });
}

export function useJenkinsJobConfig(jobFullName: string | null, enabled = true) {
  return useQuery({
    queryKey: jenkinsKeys.jobConfig(jobFullName ?? ""),
    queryFn: () => {
      if (!jobFullName) {
        return Promise.reject(new Error("job not selected"));
      }
      return jenkinsApi.getJobConfig(jobFullName);
    },
    enabled: enabled && !!jobFullName,
    staleTime: 15_000,
    retry: false,
  });
}

export function useUpdateJenkinsJobConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { jobFullName: string; xml: string }) =>
      jenkinsApi.updateJobConfig(input),
    onSuccess: async (data) => {
      queryClient.setQueryData(jenkinsKeys.jobConfig(data.jobFullName), data);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: jenkinsKeys.job(data.jobFullName) }),
        queryClient.invalidateQueries({ queryKey: jenkinsKeys.jobs() }),
      ]);
    },
  });
}

export function useJenkinsBuildDetail(
  jobFullName: string | null,
  number: number | null,
  enabled = true,
) {
  return useQuery({
    queryKey: jenkinsKeys.build(jobFullName ?? "", number ?? 0),
    queryFn: () => {
      if (!jobFullName || number == null) {
        return Promise.reject(new Error("build not selected"));
      }
      return jenkinsApi.getBuild({ jobFullName, number });
    },
    enabled: enabled && !!jobFullName && number != null && number > 0,
    staleTime: 5_000,
    refetchInterval: (q) => (q.state.data?.building ? 2_500 : false),
    retry: false,
  });
}

export function useJenkinsExecutors(enabled = true) {
  return useQuery({
    queryKey: jenkinsKeys.executors(),
    queryFn: () => jenkinsApi.executorStatus(),
    enabled,
    // 主路径：Rust jenkins-activity 推送写缓存；此处只做首屏拉取
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useJenkinsQueue(enabled = true) {
  return useQuery({
    queryKey: jenkinsKeys.queue(),
    queryFn: () => jenkinsApi.listQueue(),
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useBuildJenkinsJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { jobFullName: string; parameters?: Record<string, string> }) =>
      jenkinsApi.buildJob(input),
    onSuccess: async (result, vars) => {
      const qid = parseQueueItemId(result.queueUrl);
      if (qid != null) {
        queryClient.setQueryData(jenkinsKeys.queue(), (prev: unknown) => {
          const list = Array.isArray(prev) ? [...prev] : [];
          if (list.some((x: { id?: number }) => x?.id === qid)) return list;
          list.unshift(optimisticQueueItem({ id: qid, jobFullName: vars.jobFullName }));
          return list;
        });
      }
      // 不立刻 invalidate queue，避免把乐观项冲掉；由 activity 事件覆盖
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: jenkinsKeys.jobs() }),
        queryClient.invalidateQueries({ queryKey: jenkinsKeys.builds(vars.jobFullName) }),
        queryClient.invalidateQueries({ queryKey: jenkinsKeys.executors() }),
      ]);
    },
  });
}

export function useStopJenkinsBuild() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { jobFullName: string; number: number }) => jenkinsApi.stopBuild(input),
    onSuccess: async (_r, vars) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: jenkinsKeys.jobs() }),
        queryClient.invalidateQueries({ queryKey: jenkinsKeys.builds(vars.jobFullName) }),
        queryClient.invalidateQueries({
          queryKey: jenkinsKeys.build(vars.jobFullName, vars.number),
        }),
        queryClient.invalidateQueries({ queryKey: jenkinsKeys.executors() }),
      ]);
    },
  });
}

export function useCancelJenkinsQueueItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => jenkinsApi.cancelQueueItem(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: jenkinsKeys.queue() });
    },
  });
}

import { create } from "zustand";

export type JenkinsSection = "jobs" | "history";
export type JenkinsDetailTab = "overview" | "changes" | "history" | "config";

type JenkinsPage = "dashboard" | "detail";

interface JenkinsUiState {
  page: JenkinsPage;
  section: JenkinsSection;
  selectedJobId: string | null;
  detailTab: JenkinsDetailTab;
  /** Dashboard 底部日志预览：选中的 Job + Build # */
  previewJobId: string | null;
  previewBuildNumber: number | null;
  openDashboard: (section?: JenkinsSection) => void;
  openDetail: (jobId: string, tab?: JenkinsDetailTab) => void;
  setDetailTab: (tab: JenkinsDetailTab) => void;
  setPreview: (jobId: string | null, buildNumber: number | null) => void;
}

export const useJenkinsUiStore = create<JenkinsUiState>((set) => ({
  page: "dashboard",
  section: "jobs",
  selectedJobId: null,
  detailTab: "overview",
  previewJobId: null,
  previewBuildNumber: null,
  openDashboard: (section = "jobs") =>
    set({
      page: "dashboard",
      section,
      detailTab: "overview",
    }),
  openDetail: (jobId, tab = "overview") =>
    set({ page: "detail", selectedJobId: jobId, detailTab: tab }),
  setDetailTab: (detailTab) => set({ detailTab }),
  setPreview: (previewJobId, previewBuildNumber) => set({ previewJobId, previewBuildNumber }),
}));

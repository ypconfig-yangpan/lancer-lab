export interface NativeArgocdApplicationSummary {
  id: string;
  name: string;
  project: string;
  status: string;
  health: string;
}

export interface NativeArgocdListApplicationsInput {
  project?: string;
}

export interface NativeArgocdApi {
  listApplications(
    input?: NativeArgocdListApplicationsInput,
  ): Promise<NativeArgocdApplicationSummary[]>;
}

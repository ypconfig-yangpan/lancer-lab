export interface NativeGitBranchSummary {
  id: string;
  name: string;
  repo: string;
  status: string;
  ahead?: string;
}

export interface NativeGitListBranchesInput {
  repo: string;
}

export interface NativeGitApi {
  listBranches(input: NativeGitListBranchesInput): Promise<NativeGitBranchSummary[]>;
}

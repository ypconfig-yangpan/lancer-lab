export interface NativeHarborArtifactSummary {
  id: string;
  name: string;
  tag: string;
  status: string;
  size?: string;
}

export interface NativeHarborListArtifactsInput {
  project: string;
  repository: string;
}

export interface NativeHarborApi {
  listArtifacts(input: NativeHarborListArtifactsInput): Promise<NativeHarborArtifactSummary[]>;
}

export interface ResourceYaml {
  yaml: string;
  resourceVersion: string;
}

export type ManifestResourceKind = "pod" | "deployment" | "service";

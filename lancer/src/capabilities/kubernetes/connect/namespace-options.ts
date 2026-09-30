/** Rancher 项目级 token 往往不能 list 全集群 Namespace，用这份兜底可选列表。 */
export const KUBE_FALLBACK_NAMESPACES = [
  "sly-test",
  "sly-dev",
  "sly-uat",
  "bp-test",
] as const;

export const KUBE_PREFERRED_FALLBACK_NAMESPACE = "sly-test";

/** default 通常对项目 token 无权限；空/default 时改用业务 Namespace。 */
export function resolveWorkingNamespace(raw: string | null | undefined): string {
  const ns = (raw ?? "").trim();
  if (!ns || ns === "default") {
    return KUBE_PREFERRED_FALLBACK_NAMESPACE;
  }
  return ns;
}

export function buildNamespaceOptions(
  listed: string[] | undefined,
  current: string,
): string[] {
  if (listed && listed.length > 0) {
    return listed.includes(current) ? listed : [current, ...listed];
  }
  const set = new Set<string>([current, ...KUBE_FALLBACK_NAMESPACES]);
  return [...set];
}

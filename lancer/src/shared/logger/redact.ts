const SENSITIVE_FRAGMENTS = [
  "token",
  "password",
  "authorization",
  "clientsecret",
  "accesskey",
  "secretkey",
  "privatekey",
  "kubeconfig",
  "bearer",
] as const;

export type LogFields = Record<string, string | number | boolean | null>;

function compactKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

function keyIsSensitive(key: string): boolean {
  const compact = compactKey(key);
  return SENSITIVE_FRAGMENTS.some((fragment) => compact.includes(fragment));
}

export function redactFields(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (keyIsSensitive(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      out[key] = SENSITIVE_FRAGMENTS.some((fragment) => lower.includes(fragment))
        ? "[redacted]"
        : value;
      continue;
    }
    out[key] = value;
  }
  return out;
}

//! Secret redaction for diagnostic logs. Never log credentials as-is.

const SENSITIVE_KEY_FRAGMENTS: &[&str] = &[
    "token",
    "password",
    "authorization",
    "clientsecret",
    "accesskey",
    "secretkey",
    "privatekey",
    "kubeconfig",
    "bearer",
];

/// Returns a copy safe to write to diagnostic logs.
pub fn redact_text(input: &str) -> String {
    let lower = input.to_ascii_lowercase();
    if SENSITIVE_KEY_FRAGMENTS
        .iter()
        .any(|fragment| lower.contains(fragment))
    {
        return "[redacted]".to_string();
    }
    input.to_string()
}

fn key_is_sensitive(key: &str) -> bool {
    let compact: String = key
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect::<String>()
        .to_ascii_lowercase();
    SENSITIVE_KEY_FRAGMENTS
        .iter()
        .any(|fragment| compact.contains(fragment))
}

/// Recursively redacts string values whose keys look sensitive.
pub fn redact_json(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut out = serde_json::Map::new();
            for (key, child) in map {
                if key_is_sensitive(key) {
                    out.insert(key.clone(), serde_json::Value::String("[redacted]".into()));
                } else {
                    out.insert(key.clone(), redact_json(child));
                }
            }
            serde_json::Value::Object(out)
        }
        serde_json::Value::Array(items) => {
            serde_json::Value::Array(items.iter().map(redact_json).collect())
        }
        serde_json::Value::String(text) => serde_json::Value::String(redact_text(text)),
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::{redact_json, redact_text};
    use serde_json::json;

    #[test]
    fn redacts_bearer_blob() {
        assert_eq!(redact_text("Bearer abc"), "[redacted]");
        assert_eq!(redact_text("hello"), "hello");
    }

    #[test]
    fn redacts_token_field() {
        let input = json!({ "token": "secret", "pod": "iam-1" });
        assert_eq!(
            redact_json(&input),
            json!({ "token": "[redacted]", "pod": "iam-1" })
        );
    }
}

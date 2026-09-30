use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Correlates all diagnostic lines for one user intent (scale, connect, export, …).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct OperationId(pub String);

impl OperationId {
    pub fn generate() -> Self {
        static SEQ: AtomicU64 = AtomicU64::new(1);
        let seq = SEQ.fetch_add(1, Ordering::Relaxed);
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        Self(format!("op_{millis}_{seq}"))
    }
}

impl std::fmt::Display for OperationId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::OperationId;

    #[test]
    fn generates_prefixed_ids() {
        let id = OperationId::generate();
        assert!(id.0.starts_with("op_"));
    }
}

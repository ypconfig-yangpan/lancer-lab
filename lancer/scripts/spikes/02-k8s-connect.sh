#!/usr/bin/env bash
# Spike 2 runner
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="${HOME}/.rustup/toolchains/stable-aarch64-apple-darwin/bin:${PATH:-}"
export CARGO_HOME="${CARGO_HOME:-$ROOT/.cargo-home}"
cd "$ROOT/src-tauri"

CONTEXT="${KUBE_CONTEXT:-}"
if [[ -z "$CONTEXT" ]]; then
  if kubectl config get-contexts -o name 2>/dev/null | grep -qx 'k3d-lancer-dev'; then
    CONTEXT="k3d-lancer-dev"
  else
    CONTEXT="$(kubectl config current-context 2>/dev/null || true)"
  fi
fi
export KUBE_CONTEXT="$CONTEXT"
echo "Using context: ${KUBE_CONTEXT:-"(none)"}"
cargo run --example k8s_spike

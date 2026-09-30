#!/usr/bin/env bash
# Spike 1: typed IPC surface exists + AppErrorDto roundtrip in unit tests.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="${HOME}/.rustup/toolchains/stable-aarch64-apple-darwin/bin:${PATH:-}"
export CARGO_HOME="${CARGO_HOME:-$ROOT/.cargo-home}"

cd "$ROOT"
echo "== Spike 1: frontend typecheck + unit tests =="
pnpm typecheck
pnpm test

cd "$ROOT/src-tauri"
echo "== Spike 1: AppErrorDto mapping test =="
cargo test -q domain::error::tests::maps_coded_error_to_dto

node - <<NODE
const fs = require("fs");
const src = fs.readFileSync("$ROOT/src/shared/tauri/index.ts", "utf8");
for (const k of ["clusterApi", "namespaceApi", "podApi", "TauriInvokeError"]) {
  if (!src.includes(k)) {
    console.error("missing", k);
    process.exit(1);
  }
}
console.log("typed facade OK");
console.log("SPIKE1_OK");
NODE

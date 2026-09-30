#!/usr/bin/env bash
# Spike 3: generate ~1M log lines and verify chunked read + virtual-window math.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="${LANCER_SPIKE_LOG_DIR:-$ROOT/benchmarks/artifacts}"
LINES="${LANCER_SPIKE_LINES:-1000000}"
CHUNK="${LANCER_SPIKE_CHUNK:-5000}"
mkdir -p "$OUT_DIR"
LOG_FILE="$OUT_DIR/spike3-${LINES}.log"

echo "== Spike 3: generate ${LINES} lines =="
if [[ ! -f "$LOG_FILE" ]]; then
  python3 - <<PY
from pathlib import Path
path = Path("$LOG_FILE")
n = int("$LINES")
with path.open("w", encoding="utf-8") as f:
    for i in range(1, n + 1):
        level = ["INFO", "WARN", "ERROR", "DEBUG"][i % 4]
        f.write(f"2026-09-01T02:00:00.{i%1000:03d}Z {level} handled id={i}\n")
print("wrote", path, "bytes", path.stat().st_size)
PY
else
  echo "reuse existing $LOG_FILE"
fi

echo "== Spike 3: chunked read (Rust-like streaming via python) =="
python3 - <<PY
from pathlib import Path
path = Path("$LOG_FILE")
chunk = int("$CHUNK")
total = 0
window = []
window_limit = 10000
with path.open("r", encoding="utf-8") as f:
    batch = []
    for line in f:
        total += 1
        batch.append(line.rstrip("\n"))
        if len(batch) >= chunk:
            # simulate handing a chunk to UI
            window.extend(batch)
            if len(window) > window_limit:
                window = window[-window_limit:]
            batch.clear()
    if batch:
        window.extend(batch)
        if len(window) > window_limit:
            window = window[-window_limit:]
print(f"total_lines={total}")
print(f"ui_window={len(window)} (bounded <= {window_limit})")
print(f"first_window_line={window[0][:48] if window else ''}")
print(f"last_window_line={window[-1][:48] if window else ''}")
assert total >= int("$LINES")
assert len(window) <= window_limit
print("SPIKE3_OK")
PY

echo "Note: React Virtual List already exists in src/features/pod-logs/log-viewer.tsx"
echo "Next: wire Rust file seek/chunk IPC before Phase 2 Logs."

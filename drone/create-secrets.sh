#!/usr/bin/env bash
# 写入部署用 Secrets（deploy-*）
#   export DRONE_TOKEN=...
#   bash drone/create-secrets.sh
set -euo pipefail

DRONE_SERVER="${DRONE_SERVER:-https://drone.example.com}"
# owner/repo on your Git host
DRONE_REPO="${DRONE_REPO:-owner/repo}"
SSH_KEY_FILE="${SSH_KEY_FILE:-$HOME/.ssh/deploy_key}"
DEPLOY_HOST="${DEPLOY_HOST:-app.example.com}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_SSH_PORT="${DEPLOY_SSH_PORT:-22}"

if [[ -z "${DRONE_TOKEN:-}" ]]; then
  echo "请先: export DRONE_TOKEN=你的令牌"
  exit 1
fi
if [[ ! -f "$SSH_KEY_FILE" ]]; then
  echo "找不到部署私钥: $SSH_KEY_FILE"
  exit 1
fi

OWNER="${DRONE_REPO%/*}"
NAME="${DRONE_REPO#*/}"
API="$DRONE_SERVER/api/repos/$OWNER/$NAME/secrets"

put_secret() {
  local name="$1" value="$2" payload code
  payload=$(NAME="$name" VALUE="$value" python3 - <<'PY'
import json, os
print(json.dumps({"name": os.environ["NAME"], "data": os.environ["VALUE"], "pull_request": False}))
PY
)
  echo "→ $name"
  curl -sS -o /dev/null -X DELETE -H "Authorization: Bearer $DRONE_TOKEN" "$API/$name" || true
  code=$(curl -sS -o /tmp/drone-secret-resp.json -w "%{http_code}" -X POST \
    -H "Authorization: Bearer $DRONE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload" "$API")
  if [[ "$code" != "200" && "$code" != "201" ]]; then
    echo "失败 HTTP $code"; cat /tmp/drone-secret-resp.json; exit 1
  fi
  echo "  OK"
}

DEPLOY_SSH_KEY="$(cat "$SSH_KEY_FILE")"
echo "获取 known_hosts ..."
DEPLOY_KNOWN_HOSTS="$(ssh-keyscan -p "$DEPLOY_SSH_PORT" "$DEPLOY_HOST" 2>/dev/null)"
[[ -n "$DEPLOY_KNOWN_HOSTS" ]] || { echo "ssh-keyscan 失败"; exit 1; }

put_secret deploy-host "$DEPLOY_HOST"
put_secret deploy-user "$DEPLOY_USER"
put_secret deploy-ssh-port "$DEPLOY_SSH_PORT"
put_secret deploy-ssh-key "$DEPLOY_SSH_KEY"
put_secret deploy-known-hosts "$DEPLOY_KNOWN_HOSTS"

echo
echo "当前 Secrets："
curl -sS -H "Authorization: Bearer $DRONE_TOKEN" "$API" \
  | python3 -c 'import sys,json; print("\n".join(sorted(x["name"] for x in json.load(sys.stdin))))'

#!/usr/bin/env bash
# 把 jar 传到测试机 /opt/apps/<服务名>/app.jar
# 默认 serviceA；以后 serviceB：APP_NAME=serviceB ./scripts/push_jar.sh
set -euo pipefail

cd "$(dirname "$0")/.."
APP_NAME="${APP_NAME:-serviceA}"
LOCAL_JAR="apps/${APP_NAME}/target/${APP_NAME}.jar"
APP_DIR="${deploy_app_dir:-/opt/apps/${APP_NAME}}"

: "${deploy_host:?缺少 deploy_host}"
: "${deploy_user:?缺少 deploy_user}"
: "${deploy_ssh_port:?缺少 deploy_ssh_port}"
: "${deploy_ssh_key:?缺少 deploy_ssh_key}"
: "${deploy_known_hosts:?缺少 deploy_known_hosts}"

[[ -f "$LOCAL_JAR" ]] || { echo "没有 $LOCAL_JAR，请先：mvn -f apps/${APP_NAME}/pom.xml package"; exit 1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
umask 077
printf '%s\n' "$deploy_ssh_key" | tr -d '\r' > "$TMP/key"
printf '%s\n' "$deploy_known_hosts" | tr -d '\r' > "$TMP/known_hosts"
chmod 600 "$TMP/key" "$TMP/known_hosts"

SSH=(ssh -i "$TMP/key" -p "$deploy_ssh_port"
  -o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$TMP/known_hosts")

echo "scp → ${deploy_user}@${deploy_host}:${APP_DIR}/app.jar"
scp -i "$TMP/key" -P "$deploy_ssh_port" \
  -o BatchMode=yes -o IdentitiesOnly=yes \
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$TMP/known_hosts" \
  "$LOCAL_JAR" "${deploy_user}@${deploy_host}:${APP_DIR}/app.jar.tmp"

"${SSH[@]}" "${deploy_user}@${deploy_host}" \
  "cd '${APP_DIR}' && { [ -f app.jar ] && cp -p app.jar app.jar.bak || true; } && mv -f app.jar.tmp app.jar && chmod 0640 app.jar"

echo "push_jar 完成（${APP_NAME}）"

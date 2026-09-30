#!/usr/bin/env bash
# 重启测试机上的 systemd 服务。默认 serviceA。
set -euo pipefail

APP_NAME="${APP_NAME:-serviceA}"
SERVICE="${deploy_service_name:-${APP_NAME}}"

: "${deploy_host:?缺少 deploy_host}"
: "${deploy_user:?缺少 deploy_user}"
: "${deploy_ssh_port:?缺少 deploy_ssh_port}"
: "${deploy_ssh_key:?缺少 deploy_ssh_key}"
: "${deploy_known_hosts:?缺少 deploy_known_hosts}"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
umask 077
printf '%s\n' "$deploy_ssh_key" | tr -d '\r' > "$TMP/key"
printf '%s\n' "$deploy_known_hosts" | tr -d '\r' > "$TMP/known_hosts"
chmod 600 "$TMP/key" "$TMP/known_hosts"

SSH=(ssh -i "$TMP/key" -p "$deploy_ssh_port"
  -o BatchMode=yes -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$TMP/known_hosts")

echo "restart → ${SERVICE} @ ${deploy_host}"
"${SSH[@]}" "${deploy_user}@${deploy_host}" \
  "sudo -n systemctl restart '${SERVICE}' && systemctl is-active --quiet '${SERVICE}'"

echo "restart_app 完成：${SERVICE} 已 active"

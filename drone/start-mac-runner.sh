#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${DRONE_ENV_FILE:-$SCRIPT_DIR/.env.local}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE"
  echo "复制 $SCRIPT_DIR/.env.example 为 .env.local，填入与服务器相同的 DRONE_RPC_SECRET。"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

: "${DRONE_RPC_SECRET:?DRONE_RPC_SECRET 未设置}"
DRONE_RPC_HOST="${DRONE_RPC_HOST:-drone.example.com}"
DRONE_RPC_PROTO="${DRONE_RPC_PROTO:-https}"
DRONE_RUNNER_NAME="${DRONE_RUNNER_NAME:-mac-orbstack}"
IMAGE="${DRONE_RUNNER_IMAGE:-docker.m.daocloud.io/drone/drone-runner-docker:1}"

if ! docker info >/dev/null 2>&1; then
  echo "本机 Docker 未运行。请先启动 OrbStack（open -a OrbStack）。"
  exit 1
fi

docker rm -f drone-runner >/dev/null 2>&1 || true
# clone 默认拉 docker.io/drone/git，国内易卡住；改走镜像站
# daocloud 对 drone/git 常 403；dockerproxy 可用
CLONE_IMAGE="${DRONE_RUNNER_CLONE_IMAGE:-dockerproxy.net/drone/git:latest}"
docker run -d \
  --name drone-runner \
  --restart unless-stopped \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e DRONE_RPC_PROTO="$DRONE_RPC_PROTO" \
  -e DRONE_RPC_HOST="$DRONE_RPC_HOST" \
  -e DRONE_RPC_SECRET="$DRONE_RPC_SECRET" \
  -e DRONE_RUNNER_CAPACITY=1 \
  -e DRONE_RUNNER_NAME="$DRONE_RUNNER_NAME" \
  -e DRONE_RUNNER_CLONE_IMAGE="$CLONE_IMAGE" \
  "$IMAGE"

echo "Runner 已启动。查看日志: docker logs -f drone-runner"
docker logs --tail 30 drone-runner || true

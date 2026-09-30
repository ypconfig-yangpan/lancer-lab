#!/usr/bin/env bash
# Follow remote serviceA logs via SSH.
#   DEPLOY_HOST=app.example.com SSH_KEY_FILE=~/.ssh/deploy_key ./scripts/app_logs.sh
set -euo pipefail
ssh -i "${SSH_KEY_FILE:-$HOME/.ssh/deploy_key}" \
  -o BatchMode=yes \
  "deploy@${DEPLOY_HOST:-app.example.com}" \
  'journalctl -u serviceA -n 80 -f --no-pager'

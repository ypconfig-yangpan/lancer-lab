#!/usr/bin/env bash
# Create local k3d cluster + apply Lancer fixtures.
set -euo pipefail

CLUSTER_NAME="${LANCER_K3D_CLUSTER:-lancer-dev}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FIXTURE="$ROOT/fixtures/k8s/lancer-fixtures.yaml"

if ! command -v docker >/dev/null; then
  echo "docker required" >&2
  exit 1
fi

if ! command -v k3d >/dev/null; then
  echo "Installing k3d..."
  curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
fi

if ! command -v kubectl >/dev/null; then
  echo "kubectl required" >&2
  exit 1
fi

if k3d cluster list | grep -q "^${CLUSTER_NAME} "; then
  echo "cluster ${CLUSTER_NAME} already exists"
else
  k3d cluster create "$CLUSTER_NAME" --agents 1 --wait
fi

kubectl config use-context "k3d-${CLUSTER_NAME}"
kubectl apply -f "$FIXTURE"

echo
echo "Waiting for healthy-web Ready (others may stay broken on purpose)..."
kubectl -n lancer-fixtures rollout status deploy/healthy-web --timeout=120s || true

echo
echo "Fixture pods:"
kubectl -n lancer-fixtures get pods -o wide || true
echo
echo "Context: k3d-${CLUSTER_NAME}"
echo "Next: Lancer connect_cluster with this context"

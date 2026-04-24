#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ROOT_DIR}/deploy/azure/.env.vm"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "Copy deploy/azure/.env.vm.example to deploy/azure/.env.vm and fill it first."
  exit 1
fi

cd "${ROOT_DIR}"

docker compose \
  --env-file "${ENV_FILE}" \
  -f docker-compose.yml \
  -f deploy/azure/docker-compose.prod.yml \
  build

docker compose \
  --env-file "${ENV_FILE}" \
  -f docker-compose.yml \
  -f deploy/azure/docker-compose.prod.yml \
  up -d

docker compose \
  --env-file "${ENV_FILE}" \
  -f docker-compose.yml \
  -f deploy/azure/docker-compose.prod.yml \
  ps


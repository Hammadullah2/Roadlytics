#!/usr/bin/env bash

set -euo pipefail

BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://localhost:8080/health}"
FRONTEND_ROOT_URL="${FRONTEND_ROOT_URL:-http://localhost:5173}"
FRONTEND_ROUTE_URL="${FRONTEND_ROUTE_URL:-http://localhost:5173/projects}"
BACKEND_HEALTH_BODY="$(mktemp)"
DOCKER_CONFIG_DIR="$(mktemp -d)"

if [[ -x "/c/Program Files/Docker/Docker/resources/bin/docker-credential-desktop.exe" ]]; then
  export PATH="${PATH}:/c/Program Files/Docker/Docker/resources/bin"
fi

cat > "${DOCKER_CONFIG_DIR}/config.json" <<'EOF'
{
  "auths": {}
}
EOF

export DOCKER_CONFIG="${DOCKER_CONFIG_DIR}"

cleanup() {
  docker compose down --remove-orphans >/dev/null 2>&1 || true
  rm -f "${BACKEND_HEALTH_BODY}"
  rm -rf "${DOCKER_CONFIG_DIR}"
}

print_logs() {
  echo "---- docker compose ps ----"
  docker compose ps || true
  echo "---- docker compose logs backend frontend ----"
  docker compose logs --no-color backend frontend || true
}

fail() {
  echo "FAIL ${1}"
  print_logs
  exit 1
}

require_file() {
  local path="$1"
  if [[ ! -f "${path}" ]]; then
    fail "${path} is required"
  fi
}

env_value() {
  local key="$1"
  local value

  value="$(grep -E "^${key}=" .env | tail -n1 | cut -d= -f2- | tr -d '\r' || true)"
  printf '%s' "${value}"
}

require_env_key() {
  local key="$1"
  if [[ -z "$(env_value "${key}")" ]]; then
    fail ".env is missing ${key}"
  fi
}

wait_for_http_200() {
  local url="$1"
  local label="$2"
  local status=""

  for _ in $(seq 1 30); do
    status="$(curl -sS -o /dev/null -w '%{http_code}' "${url}" || true)"
    if [[ "${status}" == "200" ]]; then
      echo "PASS ${label}"
      return 0
    fi
    sleep 2
  done

  fail "${label} (last status: ${status:-unreachable})"
}

wait_for_backend_health() {
  local url="$1"
  local status=""

  for _ in $(seq 1 30); do
    status="$(curl -sS -o "${BACKEND_HEALTH_BODY}" -w '%{http_code}' "${url}" || true)"
    if [[ "${status}" == "200" ]] && grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "${BACKEND_HEALTH_BODY}"; then
      echo "PASS backend health"
      return 0
    fi
    sleep 2
  done

  if [[ "${status}" != "200" ]]; then
    fail "backend health HTTP ${status:-unreachable}"
  fi

  fail "backend health status is not ok"
}

trap cleanup EXIT

require_file ".env"

for key in \
  DATABASE_URL \
  SUPABASE_URL \
  SUPABASE_ANON_KEY \
  SUPABASE_SERVICE_ROLE_KEY \
  SUPABASE_JWT_SECRET \
  INTERNAL_SECRET \
  NEXT_PUBLIC_SUPABASE_URL \
  NEXT_PUBLIC_SUPABASE_ANON_KEY \
  NEXT_PUBLIC_API_URL \
  NEXT_PUBLIC_WS_URL; do
  require_env_key "${key}"
done

echo "Rendering compose config..."
docker compose config >/dev/null
echo "PASS docker compose config"

echo "Building compose services..."
docker compose build
echo "PASS docker compose build"

echo "Starting compose services..."
docker compose up -d
echo "PASS docker compose up"

wait_for_http_200 "${FRONTEND_ROOT_URL}" "frontend root"
wait_for_http_200 "${FRONTEND_ROUTE_URL}" "frontend SPA route"

echo "Checking frontend bundle configuration..."
frontend_api_url="$(env_value "NEXT_PUBLIC_API_URL")"
if ! docker compose exec -T frontend sh -lc "grep -R -Fq '${frontend_api_url}' /usr/share/nginx/html/assets"; then
  fail "frontend bundle missing configured NEXT_PUBLIC_API_URL"
fi
echo "PASS frontend bundle config"

echo "Checking backend health endpoint..."
wait_for_backend_health "${BACKEND_HEALTH_URL}"

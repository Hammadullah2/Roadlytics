#!/bin/bash
# test_docker.sh
# Verifies Docker containers on the remote AWS VPS via SSH.
# Usage:
#   ./test_docker.sh                          # use defaults
#   VPS_IP=1.2.3.4 SSH_KEY=~/.ssh/key.pem ./test_docker.sh

set -euo pipefail

VPS_IP="${VPS_IP:-13.48.193.214}"
SSH_KEY="${SSH_KEY:-${SSH_KEY_PATH:-$HOME/Downloads/roadlytics-key.pem}}"
REQUIRED_CONTAINERS=("inference-redis" "inference-server" "inference-worker" "inference-nginx")

echo "=== Roadlytics Docker Stack Verification ==="
echo "VPS: $VPS_IP"
echo ""

# ── SSH connectivity check ────────────────────────────────────────────────────
echo "[ ] Testing SSH connectivity to $VPS_IP …"
if ! ssh -i "$SSH_KEY" \
        -o ConnectTimeout=10 \
        -o StrictHostKeyChecking=no \
        -o BatchMode=yes \
        ubuntu@"$VPS_IP" "echo ok" &>/dev/null; then
    echo "❌ SSH_ERROR: Cannot connect to $VPS_IP with key $SSH_KEY"
    exit 1
fi
echo "✅ SSH connection successful"
echo ""

# ── Fetch Docker state from VPS ───────────────────────────────────────────────
echo "[ ] Fetching Docker container states …"
DOCKER_OUTPUT=$(ssh -i "$SSH_KEY" \
    -o StrictHostKeyChecking=no \
    ubuntu@"$VPS_IP" "docker ps --format '{{.Names}}|{{.Status}}|{{.Ports}}'")

echo "Running containers:"
echo "$DOCKER_OUTPUT" | while IFS='|' read -r name status ports; do
    printf "  %-25s %-35s %s\n" "$name" "$status" "$ports"
done
echo ""

# ── Validate each required container ─────────────────────────────────────────
PASS=0
FAIL=0

for container in "${REQUIRED_CONTAINERS[@]}"; do
    STATUS=$(ssh -i "$SSH_KEY" \
        -o StrictHostKeyChecking=no \
        ubuntu@"$VPS_IP" \
        "docker inspect -f '{{.State.Status}}' '$container' 2>/dev/null || echo missing")

    HEALTH=$(ssh -i "$SSH_KEY" \
        -o StrictHostKeyChecking=no \
        ubuntu@"$VPS_IP" \
        "docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' '$container' 2>/dev/null || echo missing")

    if [ "$STATUS" = "missing" ]; then
        echo "❌ DOCKER_ERROR: Container '$container' NOT FOUND on VPS."
        FAIL=$((FAIL + 1))
        continue
    fi

    if [ "$STATUS" != "running" ]; then
        echo "❌ DOCKER_ERROR: '$container' not running (state=$STATUS)."
        echo "   Last 10 log lines:"
        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ubuntu@"$VPS_IP" \
            "docker logs --tail 10 '$container' 2>&1" || true
        FAIL=$((FAIL + 1))
        continue
    fi

    if [ "$HEALTH" = "unhealthy" ]; then
        echo "❌ DOCKER_ERROR: '$container' UNHEALTHY."
        echo "   Last 10 log lines:"
        ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ubuntu@"$VPS_IP" \
            "docker logs --tail 10 '$container' 2>&1" || true
        FAIL=$((FAIL + 1))
        continue
    fi

    echo "✅ $container — running (health: $HEALTH)"
    PASS=$((PASS + 1))
done

echo ""

# ── Docker resource usage ─────────────────────────────────────────────────────
echo "[ ] Container resource usage:"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ubuntu@"$VPS_IP" \
    "docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}' 2>/dev/null" || true
echo ""

# ── Celery queue depth ────────────────────────────────────────────────────────
echo "[ ] Celery / Redis queue depth:"
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ubuntu@"$VPS_IP" \
    "docker exec inference-redis redis-cli llen celery 2>/dev/null || echo 'N/A'" | \
    awk '{print "  celery queue depth: " $0}'
echo ""

# ── Inference server local health (from VPS) ──────────────────────────────────
echo "[ ] Inference server health (from VPS loopback):"
HEALTH_STATUS=$(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no ubuntu@"$VPS_IP" \
    "curl -sf http://localhost/api/health 2>/dev/null || echo 'UNREACHABLE'")
echo "  $HEALTH_STATUS"
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
echo "=== Summary: $PASS passed, $FAIL failed ==="

if [ "$FAIL" -gt 0 ]; then
    echo "❌ Docker stack has issues. Fix failed containers before running other tests."
    exit 1
fi

echo "✅ All required Docker containers are healthy."
exit 0

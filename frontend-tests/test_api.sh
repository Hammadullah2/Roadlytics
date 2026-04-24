#!/usr/bin/env bash
# Manual API smoke tests for the Roadlytics backend.
# Usage:
#   export API_URL=https://your-vercel-url.vercel.app
#   export TOKEN=your-supabase-jwt
#   bash test_api.sh

set -euo pipefail

API="${API_URL:-http://localhost:8080}"
AUTH_HEADER="Authorization: Bearer ${TOKEN:-}"

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; exit 1; }

check_status() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then pass "$label (HTTP $actual)";
  else fail "$label — expected $expected, got $actual"; fi
}

echo "=== Roadlytics API smoke tests ==="
echo "Target: $API"
echo ""

# Health check (no auth needed)
echo "--- Health ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/health")
check_status "GET /health" "200" "$STATUS"

# Auth profile
echo "--- Auth ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" "$API/auth/profile")
check_status "GET /auth/profile" "200" "$STATUS"

# Projects CRUD
echo "--- Projects ---"
PROJ=$(curl -s -w "\n%{http_code}" -X POST "$API/projects" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"name":"Test Project","description":"CI smoke test"}')
PROJ_STATUS=$(echo "$PROJ" | tail -1)
PROJ_BODY=$(echo "$PROJ" | head -1)
check_status "POST /projects" "201" "$PROJ_STATUS"

PROJ_ID=$(echo "$PROJ_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
if [[ -z "$PROJ_ID" ]]; then fail "Could not parse project ID from response"; fi
echo "  Created project: $PROJ_ID"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" "$API/projects")
check_status "GET /projects" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" "$API/projects/$PROJ_ID")
check_status "GET /projects/{id}" "200" "$STATUS"

# Regions
echo "--- Regions ---"
REGION=$(curl -s -w "\n%{http_code}" -X POST "$API/projects/$PROJ_ID/regions" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d '{"name":"Test Region","polygon":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1],[0,0]]]}}')
REGION_STATUS=$(echo "$REGION" | tail -1)
REGION_BODY=$(echo "$REGION" | head -1)
check_status "POST /projects/{id}/regions" "201" "$REGION_STATUS"

REGION_ID=$(echo "$REGION_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
if [[ -z "$REGION_ID" ]]; then fail "Could not parse region ID"; fi
echo "  Created region: $REGION_ID"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" "$API/projects/$PROJ_ID/regions")
check_status "GET /projects/{id}/regions" "200" "$STATUS"

# Jobs — CRITICAL: must send clf_model not cls_model
echo "--- Jobs ---"
JOB=$(curl -s -w "\n%{http_code}" -X POST "$API/jobs" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d "{\"region_id\":\"$REGION_ID\",\"job_type\":\"full\",\"seg_model\":\"osm\",\"clf_model\":\"kmeans\"}")
JOB_STATUS=$(echo "$JOB" | tail -1)
JOB_BODY=$(echo "$JOB" | head -1)
check_status "POST /jobs (clf_model)" "201" "$JOB_STATUS"

JOB_ID=$(echo "$JOB_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
if [[ -z "$JOB_ID" ]]; then fail "Could not parse job ID"; fi
echo "  Created job: $JOB_ID"

# Verify cls_model (wrong field) is rejected
echo "  Testing DisallowUnknownFields rejection..."
BAD_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/jobs" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d "{\"region_id\":\"$REGION_ID\",\"job_type\":\"full\",\"seg_model\":\"osm\",\"cls_model\":\"kmeans\"}")
check_status "POST /jobs with cls_model (should reject)" "400" "$BAD_STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" "$API/jobs/$JOB_ID")
check_status "GET /jobs/{id}" "200" "$STATUS"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH_HEADER" "$API/regions/$REGION_ID/jobs")
check_status "GET /regions/{id}/jobs" "200" "$STATUS"

# Cleanup
echo "--- Cleanup ---"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -H "$AUTH_HEADER" "$API/projects/$PROJ_ID")
check_status "DELETE /projects/{id}" "200" "$STATUS"

echo ""
echo "=== All tests passed ==="

#!/usr/bin/env bash
#
# Build and deploy to Cloudflare Pages.
#
#   ./deploy.sh              build, verify the Access gate, deploy
#   ./deploy.sh --public     deploy WITHOUT requiring a gate (see below)
#   ./deploy.sh --check      verify the gate and exit; deploy nothing
#
# Why the gate check exists
# -------------------------
# Pages serves the production hostname AND a permanent per-deployment hash URL
# (<hash>.<project>.pages.dev) for every deploy. They are covered by SEPARATE
# Cloudflare Access configuration, so gating production alone leaves every hash
# URL serving the full contents of puzzles.json to anyone with the link.
#
# This script therefore fails closed: if any checked URL answers with content
# instead of an Access challenge, it aborts before uploading. Use --public only
# when the archive in puzzles.json is content you are actually entitled to
# publish to the open web.
#
set -euo pipefail

PROJECT="${PAGES_PROJECT:-groupings}"
BRANCH="${PAGES_BRANCH:-master}"
REQUIRE_GATE=1
CHECK_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --public)  REQUIRE_GATE=0; shift ;;
    --check)   CHECK_ONLY=1; shift ;;
    --project) PROJECT="$2"; shift 2 ;;
    --branch)  BRANCH="$2"; shift 2 ;;
    -h|--help) sed -n '3,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")"

# An Access-protected origin redirects to <team>.cloudflareaccess.com, or answers
# 401/403 outright. Anything else means the URL is serving content unauthenticated.
is_gated() {
  local url="$1" out code redirect
  out=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 25 "$url" 2>/dev/null || echo "000 ")
  code="${out%% *}"
  redirect="${out#* }"
  LAST_CODE="$code"
  [[ "$redirect" == *cloudflareaccess.com* ]] && return 0
  [[ "$code" == "401" || "$code" == "403" ]] && return 0
  return 1
}

# Checks the production hostname, the archive path directly (the payload that
# actually matters), and the newest per-deployment hash URL.
check_gate() {
  local urls=(
    "https://${PROJECT}.pages.dev/"
    "https://${PROJECT}.pages.dev/puzzles.json"
  )

  local hash_url
  hash_url=$(wrangler pages deployment list --project-name "$PROJECT" 2>/dev/null \
    | grep -oE "https://[a-z0-9]+\.${PROJECT}\.pages\.dev" | head -1 || true)
  [[ -n "$hash_url" ]] && urls+=("${hash_url}/" "${hash_url}/puzzles.json")

  local ungated=()
  echo "Checking Access gate on ${#urls[@]} URL(s):"
  for u in "${urls[@]}"; do
    if is_gated "$u"; then
      printf '  gated      %s (%s)\n' "$u" "$LAST_CODE"
    else
      printf '  UNGATED    %s (%s)\n' "$u" "$LAST_CODE"
      ungated+=("$u")
    fi
  done

  if [[ ${#ungated[@]} -gt 0 ]]; then
    cat >&2 <<EOF

ABORTED: ${#ungated[@]} URL(s) serve content without an Access challenge.

Gate them in the Cloudflare dashboard — BOTH are required:
  1. Zero Trust > Access > Applications: add an application for
     ${PROJECT}.pages.dev
  2. Pages > ${PROJECT} > Settings: enable Access on preview deployments,
     which covers the *.${PROJECT}.pages.dev hash URLs

Then re-run: ./deploy.sh --check

To publish openly instead, re-run with --public.
EOF
    exit 1
  fi
  echo "All checked URLs are gated."
}

if [[ $CHECK_ONLY -eq 1 ]]; then
  check_gate
  exit 0
fi

echo "==> Building"
node build.js

if [[ $REQUIRE_GATE -eq 1 ]]; then
  echo
  echo "==> Preflight"
  check_gate
else
  puzzle_count=$(node -e 'console.log(JSON.parse(require("fs").readFileSync("puzzles.json","utf8")).length)')
  echo
  echo "!! --public: skipping the gate check."
  echo "!! ${puzzle_count} puzzles in puzzles.json will be readable by anyone with the URL."
fi

echo
echo "==> Deploying to ${PROJECT} (branch ${BRANCH})"
deploy_out=$(wrangler pages deploy dist \
  --project-name "$PROJECT" \
  --branch "$BRANCH" \
  --commit-dirty=true 2>&1 | tee /dev/stderr)

new_url=$(echo "$deploy_out" | grep -oE "https://[a-z0-9]+\.${PROJECT}\.pages\.dev" | tail -1 || true)

# A fresh deployment mints a NEW hash URL, which is only covered if preview
# protection is on. Verify the thing we just created, not the thing we checked.
if [[ $REQUIRE_GATE -eq 1 && -n "$new_url" ]]; then
  echo
  echo "==> Verifying the new deployment"
  sleep 5
  if is_gated "${new_url}/puzzles.json"; then
    echo "  gated      ${new_url}/puzzles.json (${LAST_CODE})"
  else
    echo "  UNGATED    ${new_url}/puzzles.json (${LAST_CODE})" >&2
    echo >&2
    echo "WARNING: the deployment succeeded but its hash URL is not gated." >&2
    echo "Preview-deployment protection is probably off. Either enable it or" >&2
    echo "delete this deployment in the dashboard." >&2
    exit 1
  fi
fi

echo
echo "Done. ${new_url:-https://${PROJECT}.pages.dev}"

#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-http://127.0.0.1:8791}"
URL="${BASE%/}/api/health?project=demo"
BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

CODE="$(curl -sS -o "$BODY" -w '%{http_code}' "$URL")"
if [[ "$CODE" != "200" ]]; then
  echo "doctor: expected HTTP 200, got $CODE from $URL" >&2
  cat "$BODY" >&2 || true
  exit 1
fi

if ! grep -q '"ok":true' "$BODY" || ! grep -q '"service":"coordinator"' "$BODY"; then
  echo "doctor: health body missing ok/coordinator:" >&2
  cat "$BODY" >&2
  exit 1
fi

HTML="$(curl -sS "${BASE%/}/")"
if ! grep -q '>Envoy<' <<<"$HTML" || ! grep -q 'Run demo' <<<"$HTML"; then
  echo "doctor: UI missing Envoy brand or Run demo button" >&2
  exit 1
fi

echo "doctor: ok ($URL)"
cat "$BODY"
echo

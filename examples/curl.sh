#!/bin/sh
set -eu
BASE="${HELIX_BASE_URL:-http://127.0.0.1:8080/v1}"
curl -sS "${BASE}/chat/completions" \
  -H "Authorization: Bearer ${HELIX_API_KEY:?missing HELIX_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3.8-flash","messages":[{"role":"user","content":"hello"}]}'
echo

#!/bin/sh
# Helix 智枢 — curl 调用示例
# 用法: HELIX_API_KEY=sk-hx-... ./examples/curl.sh
# Base URL 用 HTTP。IP 与域名可同时使用，例如：
#   HELIX_BASE_URL=http://47.x.x.x/v1
#   HELIX_BASE_URL=http://api.yourdomain.com/v1

set -eu
BASE="${HELIX_BASE_URL:-http://127.0.0.1:8080/v1}"

curl -sS "${BASE}/chat/completions" \
  -H "Authorization: Bearer ${HELIX_API_KEY:?missing HELIX_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3.8-flash",
    "messages": [
      {"role": "user", "content": "用一句话说明什么是 API 网关。"}
    ]
  }'
echo

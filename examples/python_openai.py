"""Helix 智枢 — Python 调用示例（OpenAI SDK）

pip install openai
"""

import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["HELIX_API_KEY"],  # sk-hx-...
    # HTTP。IP 或域名均可，两者同时有效。
    base_url=os.environ.get("HELIX_BASE_URL", "http://127.0.0.1:8080/v1"),
)

resp = client.chat.completions.create(
    model="qwen3.8-flash",
    messages=[
        {"role": "system", "content": "你是简洁的中文助手。"},
        {"role": "user", "content": "用一句话说明什么是 API 网关。"},
    ],
)

print(resp.choices[0].message.content)

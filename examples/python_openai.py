"""Helix gateway - Python (OpenAI SDK)

pip install openai
"""
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["HELIX_API_KEY"],
    base_url=os.environ.get("HELIX_BASE_URL", "http://127.0.0.1:8080/v1"),
)

resp = client.chat.completions.create(
    model="qwen3.8-flash",
    messages=[{"role": "user", "content": "hello"}],
)
print(resp.choices[0].message.content)

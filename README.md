# Helix 智枢

Unified LLM API gateway. Your apps keep one Base URL and one Helix key (`sk-hx-...`). Helix forwards to Qwen / DeepSeek / OpenAI.

Same call shape as OpenAI and DashScope.

## Console login

See [CREDENTIALS.md](./CREDENTIALS.md). Keep this repository **private**.

After login you can mint/revoke keys, configure upstreams, try a playground, inspect usage, and copy snippets.

## How to call it

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-hx-YOUR_KEY",
    base_url="https://YOUR_HELIX_HOST/v1",
)

resp = client.chat.completions.create(
    model="qwen3.8-flash",
    messages=[{"role": "user", "content": "hello"}],
)
print(resp.choices[0].message.content)
```

More clients: `examples/`.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/v1/chat/completions` | supports `stream: true` |
| GET | `/v1/models` | public model names |
| Header | `Authorization: Bearer sk-hx-...` | mint keys in the console |

## Upstream

Default: QwenCloud Token Plan (Beijing)

`https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`

`model: qwen3.8-flash`

Never put the company upstream key in your product apps. Only Helix keys belong there.

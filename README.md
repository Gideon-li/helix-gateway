# Helix 智枢

统一大模型网关。你的应用只记 **一个 Base URL** 和 **一把 Helix 密钥**；Helix 再去调用 Qwen、DeepSeek、OpenAI 等上游。

调用方式和市面上的 OpenAI / 百炼完全一样。

## 控制台账号

见仓库内 `CREDENTIALS.md`（请把仓库保持 **private**）。登录页不展示预制账号；用自己的邮箱创建账号，忘记密码时重置链接会发到该邮箱。

登录后可以：

- 生成 / 吊销 API 密钥（`sk-hx-…`）
- 配置上游（默认已接 Qwen Token Plan · `qwen3.8-flash`）
- 试运行、看用量、复制各语言示例

## 应用怎么调

把原来的 OpenAI 客户端改两行：密钥换成 Helix 控制台生成的 `sk-hx-…`，`base_url` 换成你的 Helix 地址 + `/v1`。

协议是 **HTTP**。用 **服务器 IP** 或 **域名** 都可以，两套地址同时有效。

```python
from openai import OpenAI

client = OpenAI(
    api_key="sk-hx-你的密钥",
    base_url="http://你的服务器IP/v1",  # 或 http://你的域名/v1
)

resp = client.chat.completions.create(
    model="qwen3.8-flash",  # 或 helix-flash
    messages=[{"role": "user", "content": "你好"}],
)
print(resp.choices[0].message.content)
```

Node.js、cURL、fetch 示例见 [`examples/`](./examples) 和控制台「调用说明」页。

### 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/v1/chat/completions` | 对话，支持 `stream: true` |
| GET | `/v1/models` | 列出你配置的对外模型名 |
| — | Header | `Authorization: Bearer sk-hx-…` |
| — | Base URL | `http://<IP>/v1` 与 `http://<域名>/v1` 同时可用 |

## 上游

Helix 不训练模型。默认上游是 **QwenCloud Token Plan（北京）**：

```
https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1
model: qwen3.8-flash
```

控制台「上游」页可以改 Base URL、换密钥，或再加 OpenAI / DeepSeek 等任何 OpenAI 兼容接口。

**不要把上游公司的密钥写进业务应用。** 业务应用只持有 Helix 密钥。

## 本地 / 部署

本仓库是完整的 Helix 控制台 + 网关（TanStack Start）。预览环境会自动建库；正式部署需要 Postgres（`DATABASE_URL`）。

首次登录后会自动写入 Qwen 上游，并生成一把默认 Helix 密钥（完整密钥只显示一次）。

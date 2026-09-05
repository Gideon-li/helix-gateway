/**
 * Helix 智枢 — 原生 fetch 调用示例
 * HTTP 接口。IP 与域名可同时使用。
 */
const base = process.env.HELIX_BASE_URL ?? "http://127.0.0.1:8080/v1";
const key = process.env.HELIX_API_KEY;

const res = await fetch(`${base}/chat/completions`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "qwen3.8-flash",
    messages: [{ role: "user", content: "用一句话说明什么是 API 网关。" }],
  }),
});

const data = await res.json();
if (!res.ok) {
  console.error(data);
  process.exit(1);
}
console.log(data.choices[0].message.content);

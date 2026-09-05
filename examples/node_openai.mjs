/**
 * Helix 智枢 — Node.js 调用示例（OpenAI SDK）
 *
 * npm install openai
 */
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.HELIX_API_KEY,
  // HTTP。IP 或域名均可，两者同时有效。
  baseURL: process.env.HELIX_BASE_URL ?? "http://127.0.0.1:8080/v1",
});

const resp = await client.chat.completions.create({
  model: "qwen3.8-flash",
  messages: [
    { role: "system", content: "你是简洁的中文助手。" },
    { role: "user", content: "用一句话说明什么是 API 网关。" },
  ],
});

console.log(resp.choices[0].message.content);

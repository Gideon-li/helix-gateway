import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.HELIX_API_KEY,
  baseURL: process.env.HELIX_BASE_URL ?? "http://127.0.0.1:8080/v1",
});

const resp = await client.chat.completions.create({
  model: "qwen3.8-flash",
  messages: [{ role: "user", content: "hello" }],
});
console.log(resp.choices[0].message.content);

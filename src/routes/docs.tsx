import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AccessEndpoints, useAccessEndpoints } from "@/components/access-endpoints";
import { CopyButton } from "@/components/copy-button";
import { AppGuard, PageHeader } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { placeholderBase } from "@/lib/gateway/access";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/docs")({ component: Page });

function Page() {
  return (
    <AppGuard>
      <Docs />
    </AppGuard>
  );
}

function Docs() {
  const access = useAccessEndpoints();
  const [via, setVia] = useState<"ip" | "domain">("ip");
  const sampleKey = "sk-hx-你的密钥";
  const originBase =
    via === "ip" ? access.urls.ip || placeholderBase("ip") : access.urls.domain || placeholderBase("domain");
  const snippets = useMemo(() => buildSnippets(originBase, sampleKey), [originBase]);

  return (
    <div>
      <PageHeader
        title="调用说明"
        description="OpenAI 兼容接口，协议为 HTTP。公网 IP 和域名可以同时用，应用里只记一个 Base URL 和一把 Helix 密钥。"
      />

      <AccessEndpoints config={access.config} setConfig={access.setConfig} />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="text-xs tracking-wide text-faint uppercase">鉴权</p>
          <p className="mt-2 font-mono text-sm">Authorization: Bearer sk-hx-…</p>
          <p className="mt-2 text-xs text-muted">在控制台生成密钥。不要把上游公司的密钥写进业务应用。</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs tracking-wide text-faint uppercase">模型</p>
          <p className="mt-2 font-mono text-sm">qwen3.8-flash</p>
          <p className="mt-2 text-xs text-muted">也可用别名 helix-flash，效果相同。</p>
        </Card>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-medium">示例代码</h2>
        <div className="flex flex-wrap gap-2">
          <ModePill active={via === "ip"} onClick={() => setVia("ip")}>
            用 IP
          </ModePill>
          <ModePill active={via === "domain"} onClick={() => setVia("domain")}>
            用域名
          </ModePill>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">
        当前示例 Base URL：<span className="font-mono text-steel">{originBase}</span>
        。换一种接入方式，代码里只改这一行。
      </p>

      <Snippet title="cURL" code={snippets.curl} />
      <Snippet title="Python · OpenAI SDK" code={snippets.python} />
      <Snippet title="Node.js · OpenAI SDK" code={snippets.node} />
      <Snippet title="浏览器 / fetch" code={snippets.fetch} />
    </div>
  );
}

function ModePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-4 text-xs font-medium transition-colors duration-150",
        active ? "border-border-strong bg-surface-2 text-fg" : "border-border text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <Card className="mt-4 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <CopyButton value={code} label="复制代码" />
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[12px] leading-6 text-steel">{code}</pre>
    </Card>
  );
}

function buildSnippets(base: string, key: string) {
  const origin = base.replace(/\/v1\/?$/, "");
  return {
    curl: `curl ${origin}/v1/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen3.8-flash",
    "messages": [{"role": "user", "content": "你好，Helix"}]
  }'`,
    python: `from openai import OpenAI

client = OpenAI(
    api_key="${key}",
    base_url="${base}",
)

resp = client.chat.completions.create(
    model="qwen3.8-flash",
    messages=[{"role": "user", "content": "你好，Helix"}],
)
print(resp.choices[0].message.content)`,
    node: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${key}",
  baseURL: "${base}",
});

const resp = await client.chat.completions.create({
  model: "qwen3.8-flash",
  messages: [{ role: "user", content: "你好，Helix" }],
});
console.log(resp.choices[0].message.content);`,
    fetch: `const res = await fetch("${origin}/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer ${key}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "qwen3.8-flash",
    messages: [{ role: "user", content: "你好，Helix" }],
  }),
});
const data = await res.json();
console.log(data.choices[0].message.content);`,
  };
}

import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppGuard, PageHeader } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { loadWorkspace, runPlayground } from "@/lib/server/gateway";

export const Route = createFileRoute("/playground")({ component: Page });

function Page() {
  return (
    <AppGuard>
      <Playground />
    </AppGuard>
  );
}

function Playground() {
  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => loadWorkspace() });
  const models = workspace.data?.models ?? [];
  const [model, setModel] = useState("qwen3.8-flash");
  const [prompt, setPrompt] = useState("用一句话介绍 Helix 智枢网关。");
  const [answer, setAnswer] = useState("");
  const [meta, setMeta] = useState("");

  const run = useMutation({
    mutationFn: () =>
      runPlayground({
        data: {
          model,
          messages: [{ role: "user", content: prompt }],
        },
      }),
    onSuccess: (res) => {
      setAnswer(res.content);
      const tokens = res.usage?.total_tokens ?? (res.usage?.prompt_tokens ?? 0) + (res.usage?.completion_tokens ?? 0);
      setMeta(`${res.model} · ${res.latencyMs}ms · ${tokens} tokens`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="试运行"
        description="用控制台会话直接打上游，不必先复制密钥。确认 Qwen 通了，再把 Helix 密钥接到你的应用。"
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="p-5">
          <label className="text-sm font-medium text-muted">模型</label>
          <select
            className="mt-2 h-11 w-full appearance-none rounded-md border border-border bg-surface px-3 text-sm text-fg"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {(models.length ? models : [{ publicName: "qwen3.8-flash" }]).map((m) => (
              <option key={m.publicName} value={m.publicName}>
                {m.publicName}
              </option>
            ))}
          </select>
          <label className="mt-5 block text-sm font-medium text-muted">提示词</label>
          <Textarea className="mt-2 min-h-44" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <Button className="mt-4 w-full" disabled={run.isPending || !prompt.trim()} onClick={() => run.mutate()}>
            {run.isPending ? "生成中…" : "发送"}
          </Button>
        </Card>
        <Card className="flex min-h-80 flex-col p-5">
          <p className="text-sm font-medium text-muted">回复</p>
          {meta ? <p className="mt-1 font-mono text-xs text-faint">{meta}</p> : null}
          <div className="mt-4 flex-1 whitespace-pre-wrap text-sm leading-7 text-fg">
            {run.isPending ? "正在请求上游…" : answer || "结果会显示在这里。"}
          </div>
        </Card>
      </div>
    </div>
  );
}

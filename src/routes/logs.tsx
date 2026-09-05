import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AppGuard, PageHeader, formatNumber, formatTime } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { loadWorkspace } from "@/lib/server/gateway";

export const Route = createFileRoute("/logs")({ component: Page });

function Page() {
  return (
    <AppGuard>
      <Logs />
    </AppGuard>
  );
}

function Logs() {
  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => loadWorkspace() });
  const logs = workspace.data?.logs ?? [];

  return (
    <div>
      <PageHeader title="用量" description="每次通过 Helix 转发的调用都会记在这里，方便核对哪个密钥、哪个模型在消耗。" />
      <Card className="overflow-hidden p-0">
        <div className="hidden grid-cols-[1.2fr_0.8fr_0.6fr_0.7fr_0.7fr] gap-3 border-b border-border px-5 py-3 text-xs text-faint md:grid">
          <span>时间 / 密钥</span>
          <span>模型</span>
          <span>状态</span>
          <span>Token</span>
          <span>延迟</span>
        </div>
        {logs.length === 0 ? (
          <p className="px-5 py-12 text-sm text-muted">还没有调用记录。去「试运行」发一条，或用你的应用打接口。</p>
        ) : (
          <div className="divide-y divide-border">
            {logs.map((row) => (
              <div key={row.id} className="grid gap-1 px-5 py-4 md:grid-cols-[1.2fr_0.8fr_0.6fr_0.7fr_0.7fr] md:items-center md:gap-3">
                <div>
                  <p className="text-sm">{formatTime(row.createdAt)}</p>
                  <p className="text-xs text-faint">{row.keyName ?? "控制台"}</p>
                </div>
                <p className="font-mono text-xs">{row.model || "—"}</p>
                <div>
                  <Badge tone={row.status < 400 ? "ok" : "danger"}>{row.status || "—"}</Badge>
                  {row.error ? <p className="mt-1 line-clamp-2 text-xs text-danger">{row.error}</p> : null}
                </div>
                <p className="tabular-nums text-sm">{formatNumber(row.promptTokens + row.completionTokens)}</p>
                <p className="tabular-nums text-sm">{formatNumber(row.latencyMs)} ms</p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

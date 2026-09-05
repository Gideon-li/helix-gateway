import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { AccessEndpoints } from "@/components/access-endpoints";
import { CopyButton, copyText } from "@/components/copy-button";
import { AppGuard, PageHeader, formatNumber, formatTime } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { maskKey } from "@/lib/utils";
import { createApiKey, loadWorkspace, revokeApiKey } from "@/lib/server/gateway";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <AppGuard>
      <Dashboard />
    </AppGuard>
  );
}

function Dashboard() {
  const qc = useQueryClient();
  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => loadWorkspace() });
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  useEffect(() => {
    if (workspace.data?.starterKey) setRevealed(workspace.data.starterKey);
  }, [workspace.data?.starterKey]);

  const createMut = useMutation({
    mutationFn: () => createApiKey({ data: { name } }),
    onSuccess: (res) => {
      setRevealed(res.plaintext);
      setName("");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["workspace"] });
      toast.success("密钥已生成，请立即复制");
    },
    onError: (e) => toast.error(e.message),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => revokeApiKey({ data: { id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["workspace"] });
      toast.success("已吊销");
    },
    onError: (e) => toast.error(e.message),
  });

  const series = useMemo(() => fillDays(workspace.data?.stats.series ?? []), [workspace.data?.stats.series]);
  const stats = workspace.data?.stats;

  return (
    <div>
      <PageHeader
        title="控制台"
        description="生成 Helix 密钥。你的应用用这把钥匙调用 HTTP 接口 /v1/chat/completions，IP 和域名可同时使用。"
        action={
          <Button onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            新建密钥
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="近 24 小时调用" value={formatNumber(stats?.requests24h ?? 0)} />
        <Stat label="近 24 小时 Token" value={formatNumber(stats?.tokens24h ?? 0)} />
        <Stat label="有效密钥" value={formatNumber(stats?.activeKeys ?? 0)} />
        <Stat label="近 24 小时失败" value={formatNumber(stats?.errors24h ?? 0)} />
      </div>

      <div className="mt-6">
        <AccessEndpoints />
      </div>

      <Card className="mt-6 p-5">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-sm font-medium">七日调用</h2>
            <p className="text-xs text-muted">按天统计请求次数</p>
          </div>
        </div>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="helixFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#b8c4ce" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#b8c4ce" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: "#8d8f96", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "#15161a", border: "1px solid rgb(238 234 226 / 0.12)", borderRadius: 12 }}
                labelStyle={{ color: "#8d8f96" }}
              />
              <Area type="monotone" dataKey="requests" stroke="#b8c4ce" fill="url(#helixFill)" strokeWidth={1.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="mt-6 overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-medium">API 密钥</h2>
          <p className="mt-1 text-xs text-muted">完整密钥只在创建时显示一次。</p>
        </div>
        <div className="divide-y divide-border">
          {(workspace.data?.keys ?? []).length === 0 ? (
            <p className="px-5 py-10 text-sm text-muted">还没有密钥。点击右上角生成第一把。</p>
          ) : (
            (workspace.data?.keys ?? []).map((key) => (
              <div key={key.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    <Badge tone={key.status === "active" ? "ok" : "danger"}>{key.status === "active" ? "有效" : "已吊销"}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted">{maskKey(key.prefix, key.last4)}</p>
                  <p className="mt-1 text-xs text-faint">创建 {formatTime(key.createdAt)} · 最近使用 {formatTime(key.lastUsedAt)}</p>
                </div>
                {key.status === "active" ? (
                  <Button variant="danger" size="sm" onClick={() => revokeMut.mutate(key.id)} disabled={revokeMut.isPending}>
                    吊销
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>新建密钥</DialogTitle>
          <DialogDescription>给这把钥匙起个名字，方便以后辨认是哪个应用在用。</DialogDescription>
          <div className="mt-5 space-y-2">
            <Label htmlFor="key-name">名称</Label>
            <Input
              id="key-name"
              placeholder="例如：官网客服、内部脚本"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending ? "生成中…" : "生成"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(revealed)} onOpenChange={(v) => !v && setRevealed(null)}>
        <DialogContent>
          <DialogTitle>请立即保存密钥</DialogTitle>
          <DialogDescription>完整密钥只显示这一次。之后只能看到前后几位。</DialogDescription>
          {revealed ? (
            <div className="mt-5 rounded-xl border border-border bg-bg p-4">
              <code className="block break-all font-mono text-sm">{revealed}</code>
              <div className="mt-3">
                <CopyButton value={revealed} />
              </div>
            </div>
          ) : null}
          <div className="mt-6 flex justify-end">
            <Button
              onClick={async () => {
                if (revealed) await copyText(revealed);
                setRevealed(null);
              }}
            >
              复制并关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-display text-3xl tabular-nums tracking-tight">{value}</p>
    </Card>
  );
}

function fillDays(series: { day: string; requests: number; tokens: number }[]) {
  const map = new Map(series.map((s) => [s.day, s]));
  const out: { label: string; requests: number; tokens: number }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hit = map.get(key);
    out.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      requests: hit?.requests ?? 0,
      tokens: hit?.tokens ?? 0,
    });
  }
  return out;
}

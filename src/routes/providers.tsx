import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppGuard, PageHeader } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROVIDER_PRESETS } from "@/lib/gateway/constants";
import { loadWorkspace, removeModel, removeProvider, saveModel, saveProvider, testProvider } from "@/lib/server/gateway";

export const Route = createFileRoute("/providers")({ component: Page });

function Page() {
  return (
    <AppGuard>
      <Providers />
    </AppGuard>
  );
}

function Providers() {
  const qc = useQueryClient();
  const workspace = useQuery({ queryKey: ["workspace"], queryFn: () => loadWorkspace() });
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState<string>(PROVIDER_PRESETS[0].baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [modelProviderId, setModelProviderId] = useState("");
  const [publicName, setPublicName] = useState("qwen3.8-flash");
  const [upstreamName, setUpstreamName] = useState("qwen3.8-flash");

  const saveMut = useMutation({
    mutationFn: () =>
      saveProvider({
        data: { id: editingId, name, baseUrl, apiKey: apiKey || undefined },
      }),
    onSuccess: () => {
      toast.success("上游已保存");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const testMut = useMutation({
    mutationFn: (id: string) => testProvider({ data: { id, baseUrl: "", model: "qwen3.8-flash" } }),
    onSuccess: (res) => {
      if (res.ok) toast.success(`连通 · ${res.latencyMs}ms`);
      else toast.error(`失败 ${res.status}: ${res.snippet}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => removeProvider({ data: { id } }),
    onSuccess: () => {
      toast.success("已删除上游");
      void qc.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const saveModelMut = useMutation({
    mutationFn: () =>
      saveModel({
        data: { providerId: modelProviderId, publicName, upstreamName },
      }),
    onSuccess: () => {
      toast.success("模型已添加");
      setModelOpen(false);
      void qc.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const removeModelMut = useMutation({
    mutationFn: (id: string) => removeModel({ data: { id } }),
    onSuccess: () => {
      toast.success("已删除模型");
      void qc.invalidateQueries({ queryKey: ["workspace"] });
    },
    onError: (e) => toast.error(e.message),
  });

  function openCreate() {
    setEditingId(undefined);
    setName("Qwen Token Plan");
    setBaseUrl(PROVIDER_PRESETS[0].baseUrl);
    setApiKey("");
    setOpen(true);
  }

  function openEdit(id: string) {
    const p = workspace.data?.providers.find((x) => x.id === id);
    if (!p) return;
    setEditingId(p.id);
    setName(p.name);
    setBaseUrl(p.baseUrl);
    setApiKey("");
    setOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="上游"
        description="Helix 本身不训练模型。上游 Base URL 支持 HTTPS 域名，也支持 HTTP + IP（例如 http://10.0.0.8:8000/v1）。"
        action={<Button onClick={openCreate}>添加上游</Button>}
      />

      <div className="grid gap-4">
        {(workspace.data?.providers ?? []).map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-medium">{p.name}</h2>
                  <Badge tone={p.enabled ? "ok" : "danger"}>{p.enabled ? "启用" : "停用"}</Badge>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-muted">{p.baseUrl}</p>
                <p className="mt-1 font-mono text-xs text-faint">Key {p.keyHint}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => testMut.mutate(p.id)} disabled={testMut.isPending}>
                  测试连通
                </Button>
                <Button variant="outline" size="sm" onClick={() => openEdit(p.id)}>
                  编辑
                </Button>
                <Button variant="danger" size="sm" onClick={() => removeMut.mutate(p.id)}>
                  删除
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {(workspace.data?.providers ?? []).length === 0 ? (
          <Card className="p-8 text-sm text-muted">还没有上游。登录后会自动写入 Qwen Token Plan；也可手动添加。</Card>
        ) : null}
      </div>

      <div className="mt-10 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl tracking-tight">对外模型名</h2>
          <p className="mt-1 text-sm text-muted">应用里填写的模型名，会映射到上游真实模型。</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setModelProviderId(workspace.data?.providers[0]?.id ?? "");
            setPublicName("qwen3.8-flash");
            setUpstreamName("qwen3.8-flash");
            setModelOpen(true);
          }}
        >
          添加映射
        </Button>
      </div>

      <Card className="mt-4 overflow-hidden p-0">
        <div className="divide-y divide-border">
          {(workspace.data?.models ?? []).map((m) => {
            const provider = workspace.data?.providers.find((p) => p.id === m.providerId);
            return (
              <div key={m.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-mono text-sm">{m.publicName}</p>
                  <p className="mt-1 text-xs text-muted">
                    → {m.upstreamName} · {provider?.name ?? "未知上游"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeModelMut.mutate(m.id)}>
                  删除
                </Button>
              </div>
            );
          })}
          {(workspace.data?.models ?? []).length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">暂无模型映射。</p>
          ) : null}
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>{editingId ? "编辑上游" : "添加上游"}</DialogTitle>
          <DialogDescription>Base URL 填到 /v1 这一层。可用 https://域名，也可用 http://IP:端口。</DialogDescription>
          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label>预设</Label>
              <div className="flex flex-wrap gap-2">
                {PROVIDER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="rounded-full border border-border px-3 py-1.5 text-xs text-muted hover:border-border-strong hover:text-fg"
                    onClick={() => {
                      setName(preset.name);
                      setBaseUrl(preset.baseUrl);
                    }}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pname">名称</Label>
              <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="purl">Base URL</Label>
              <Input id="purl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkey">上游 API Key {editingId ? "（留空则不修改）" : ""}</Label>
              <Input
                id="pkey"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-…"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={modelOpen} onOpenChange={setModelOpen}>
        <DialogContent>
          <DialogTitle>添加模型映射</DialogTitle>
          <DialogDescription>对外名称是你的应用传入的 model，上游名称是真正发给 Qwen 的 id。</DialogDescription>
          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label>上游</Label>
              <select
                className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                value={modelProviderId}
                onChange={(e) => setModelProviderId(e.target.value)}
              >
                {(workspace.data?.providers ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pub">对外名称</Label>
              <Input id="pub" value={publicName} onChange={(e) => setPublicName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="up">上游名称</Label>
              <Input id="up" value={upstreamName} onChange={(e) => setUpstreamName(e.target.value)} />
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setModelOpen(false)}>
              取消
            </Button>
            <Button onClick={() => saveModelMut.mutate()} disabled={saveModelMut.isPending}>
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

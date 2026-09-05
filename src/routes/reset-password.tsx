import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { HelixMark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completePasswordReset } from "@/lib/server/gateway";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });

function ResetPassword() {
  const navigate = useNavigate();
  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") ?? "";
  }, []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (password.length < 8) {
      toast.error("新密码至少 8 位");
      return;
    }
    if (password !== confirm) {
      toast.error("两次输入的密码不一致");
      return;
    }
    if (!token) {
      toast.error("重置链接无效或已过期");
      return;
    }
    setBusy(true);
    try {
      await completePasswordReset({ data: { token, password } });
      toast.success("密码已更新，请用新密码登录");
      await navigate({ to: "/login" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重置失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg text-fg">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_10%_0%,rgb(184_196_206/0.08),transparent_55%)]" />
      <div className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
        <section className="w-full rounded-2xl border border-border bg-surface p-6 md:p-8">
          <HelixMark className="size-9 text-accent" />
          <h1 className="mt-6 font-display text-2xl tracking-tight">设置新密码</h1>
          <p className="mt-1 text-sm text-muted">链接仅能使用一次，一小时内有效。</p>
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-password">新密码</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="至少 8 位"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">确认密码</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "保存中…" : "保存新密码"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => void navigate({ to: "/login" })}>
              返回登录
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

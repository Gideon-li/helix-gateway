import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { HelixMark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { approveResetByMailToken } from "@/lib/server/gateway";

export const Route = createFileRoute("/approve-reset")({ component: ApproveReset });

function ApproveReset() {
  const navigate = useNavigate();
  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") ?? "";
  }, []);
  const [state, setState] = useState<"working" | "self" | "member" | "error">("working");
  const [message, setMessage] = useState("正在确认重置申请…");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("确认链接无效或已过期");
      return;
    }
    let cancelled = false;
    void approveResetByMailToken({ data: { token } })
      .then(async (result) => {
        if (cancelled) return;
        if (result.kind === "self" && result.resetToken) {
          window.location.assign(`/reset-password?token=${encodeURIComponent(result.resetToken)}`);
          return;
        }
        setState("member");
        setMessage(`已允许 ${result.email} 重置密码。设置新密码的邮件已发出。`);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState("error");
        setMessage(err instanceof Error ? err.message : "确认失败");
      });
    return () => {
      cancelled = true;
    };
  }, [token, navigate]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg text-fg">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_10%_0%,rgb(184_196_206/0.08),transparent_55%)]" />
      <div className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
        <section className="w-full rounded-2xl border border-border bg-surface p-6 md:p-8">
          <HelixMark className="size-9 text-accent" />
          <h1 className="mt-6 font-display text-2xl tracking-tight">
            {state === "error" ? "无法确认" : state === "member" ? "已允许重置" : "正在确认"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted">{message}</p>
          {state !== "working" ? (
            <Button type="button" className="mt-6 w-full" onClick={() => void navigate({ to: "/login" })}>
              返回登录
            </Button>
          ) : null}
        </section>
      </div>
    </main>
  );
}

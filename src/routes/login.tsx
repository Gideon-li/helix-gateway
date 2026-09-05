import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { HelixMark } from "@/components/mark";
import { LoadingSplash } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "@/lib/gateway/constants";
import { bootstrapAdmin } from "@/lib/server/gateway";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState(ADMIN_PASSWORD);
  const [busy, setBusy] = useState<"in" | "up" | null>(null);

  useEffect(() => {
    void bootstrapAdmin().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isPending && user) void navigate({ to: "/" });
  }, [isPending, user, navigate]);

  async function handleEmail(mode: "in" | "up") {
    setBusy(mode);
    try {
      if (mode === "up") {
        const { error } = await authClient.signUp.email({
          email,
          password,
          name: email.split("@")[0] || "Helix",
          callbackURL: "/",
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await authClient.signIn.email({ email, password, callbackURL: "/" });
        if (error) throw new Error(error.message);
      }
      toast.success(mode === "up" ? "账号已创建" : "已登录");
      await navigate({ to: "/" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(null);
    }
  }

  if (isPending) return <LoadingSplash />;
  if (user) return <LoadingSplash message="已登录，正在进入控制台…" />;

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg text-fg">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_50%_at_10%_0%,rgb(184_196_206/0.08),transparent_55%)]" />
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-2">
        <section className="hidden lg:block">
          <HelixMark className="size-12 text-accent" />
          <p className="mt-8 text-xs tracking-[0.22em] text-steel uppercase">Helix 智枢</p>
          <h1 className="mt-4 font-display text-5xl leading-[1.1] tracking-tight">
            一个密钥，
            <br />
            调用所有大模型。
          </h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-muted">
            OpenAI 兼容接口，协议 HTTP。用服务器 IP 或域名都可以。把 Qwen、DeepSeek 或其他上游收进 Helix，应用只记一个 Base URL 和一把密钥。
          </p>
        </section>

        <section className="mx-auto w-full max-w-md rounded-2xl border border-border bg-surface p-6 md:p-8">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <HelixMark className="size-9 text-accent" />
            <div>
              <div className="font-display text-xl">Helix</div>
              <div className="text-xs tracking-[0.18em] text-muted uppercase">智枢</div>
            </div>
          </div>
          <h2 className="font-display text-2xl tracking-tight">登录控制台</h2>
          <p className="mt-1 text-sm text-muted">用账号密码管理密钥，或使用社交登录。</p>

          <div className="mt-5 rounded-xl border border-border bg-bg/40 p-4 text-sm">
            <p className="text-xs tracking-wide text-faint uppercase">预置管理员</p>
            <p className="mt-2 font-mono text-[13px] text-fg">账号 {ADMIN_EMAIL}</p>
            <p className="mt-1 font-mono text-[13px] text-fg">密码 {ADMIN_PASSWORD}</p>
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleEmail("in");
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy !== null}>
              {busy === "in" ? "登录中…" : "登录"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy !== null}
              onClick={() => void handleEmail("up")}
            >
              {busy === "up" ? "创建中…" : "创建账号"}
            </Button>
          </form>

          {authEnabled ? (
            <>
              <div className="my-6 flex items-center gap-3 text-xs text-faint">
                <span className="h-px flex-1 bg-border" />
                或
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-2">
                {GROK_PROVIDERS.map((p) => (
                  <Button
                    key={p.providerId}
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => void signIn(p.providerId, { callbackURL: "/" })}
                  >
                    使用 {p.label} 继续
                  </Button>
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

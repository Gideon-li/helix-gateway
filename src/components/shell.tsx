import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Activity, BookOpen, KeyRound, Menu, Play, Server, Users } from "lucide-react";
import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { HelixMark } from "@/components/mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { can, firstAllowedPath, pathPermission, ROLE_LABEL, type Role } from "@/lib/gateway/roles";
import { loadMe } from "@/lib/server/gateway";
import { cn } from "@/lib/utils";

type Me = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  status: "active" | "disabled";
  createdAt: string;
};

const MeContext = createContext<Me | null>(null);
export function useMe(): Me | null {
  return useContext(MeContext);
}

const NAV = [
  { to: "/", label: "控制台", icon: KeyRound, perm: "keys.read" as const },
  { to: "/providers", label: "上游", icon: Server, perm: "providers.read" as const },
  { to: "/playground", label: "试运行", icon: Play, perm: "playground" as const },
  { to: "/logs", label: "用量", icon: Activity, perm: "logs.read" as const },
  { to: "/docs", label: "调用说明", icon: BookOpen, perm: "docs.read" as const },
  { to: "/users", label: "账号", icon: Users, perm: "users.manage" as const },
] as const;

function NavLinks({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.filter((item) => can(role, item.perm)).map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
              active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/70 hover:text-fg",
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-3 text-fg">
      <HelixMark className="size-8 text-accent" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-lg tracking-tight">Helix</span>
        <span className="mt-0.5 text-[11px] tracking-[0.16em] text-muted uppercase">智枢</span>
      </span>
    </Link>
  );
}

export function Shell({ children, me }: { children: ReactNode; me: Me }) {
  const [open, setOpen] = useState(false);
  return (
    <MeContext.Provider value={me}>
      <div className="min-h-screen bg-bg text-fg">
        <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-bg p-5 md:flex md:flex-col">
          <Brand />
          <div className="mt-8 flex-1">
            <NavLinks role={me.role} />
          </div>
          <p className="text-[11px] leading-5 text-faint">HTTP 接口，IP 与域名同时可用。</p>
        </aside>

        <div className="md:pl-60">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-bg/85 px-4 backdrop-blur-sm md:h-16 md:px-8">
            <div className="flex items-center gap-2 md:hidden">
              <Sheet open={open} onOpenChange={setOpen}>
                <Button variant="ghost" size="icon" aria-label="打开菜单" onClick={() => setOpen(true)}>
                  <Menu className="size-5" />
                </Button>
                <SheetContent>
                  <Brand />
                  <div className="mt-8">
                    <NavLinks role={me.role} onNavigate={() => setOpen(false)} />
                  </div>
                </SheetContent>
              </Sheet>
              <Brand />
            </div>
            <div className="hidden items-center gap-2 text-sm text-muted md:flex">
              OpenAI 兼容网关
              <Badge tone="steel">{ROLE_LABEL[me.role]}</Badge>
            </div>
            <UserButton />
          </header>
          <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
        </div>
      </div>
    </MeContext.Provider>
  );
}

export function LoadingSplash({ message = "正在核对登录状态…" }: { message?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-fg">
      <HelixMark className="size-12 text-accent" />
      <h1 className="mt-6 font-display text-3xl tracking-tight">Helix 智枢</h1>
      <p className="mt-2 text-sm text-muted">{message}</p>
    </div>
  );
}

export function AppGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, isPending } = useCurrentUserState();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => loadMe(),
    enabled: Boolean(user),
    retry: false,
  });

  useEffect(() => {
    if (!me.data || me.data.status !== "active") return;
    const needed = pathPermission(pathname);
    if (needed && !can(me.data.role, needed)) {
      void navigate({ to: firstAllowedPath(me.data.role) });
    }
  }, [me.data, pathname, navigate]);

  if (isPending || (user && me.isPending)) return <LoadingSplash />;
  if (!user) {
    return (
      <>
        <RedirectToSignIn />
        <LoadingSplash message="正在前往登录…" />
      </>
    );
  }
  if (me.error) {
    return <LoadingSplash message={me.error instanceof Error ? me.error.message : "账号未开通"} />;
  }
  if (!me.data) return <LoadingSplash />;
  if (me.data.status !== "active") {
    return <LoadingSplash message="账号已停用，请联系超级管理员。" />;
  }
  return <Shell me={me.data}>{children}</Shell>;
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-3xl tracking-tight md:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("zh-CN").format(n);
}

export function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

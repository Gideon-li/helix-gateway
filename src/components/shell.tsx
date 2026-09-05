import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, KeyRound, Menu, Play, Server, Activity } from "lucide-react";
import { type ReactNode, useState } from "react";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { HelixMark } from "@/components/mark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "控制台", icon: KeyRound },
  { to: "/providers", label: "上游", icon: Server },
  { to: "/playground", label: "试运行", icon: Play },
  { to: "/logs", label: "用量", icon: Activity },
  { to: "/docs", label: "调用说明", icon: BookOpen },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
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

export function Shell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-bg text-fg">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-border bg-bg p-5 md:flex md:flex-col">
        <Brand />
        <div className="mt-8 flex-1">
          <NavLinks />
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
                  <NavLinks onNavigate={() => setOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <Brand />
          </div>
          <div className="hidden text-sm text-muted md:block">OpenAI 兼容网关</div>
          <UserButton />
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
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
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <LoadingSplash />;
  if (!user) {
    return (
      <>
        <RedirectToSignIn />
        <LoadingSplash message="正在前往登录…" />
      </>
    );
  }
  return <Shell>{children}</Shell>;
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

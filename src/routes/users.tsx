import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppGuard, PageHeader, formatTime } from "@/components/shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ASSIGNABLE_ROLES,
  ROLE_HINT,
  ROLE_LABEL,
  type AssignableRole,
  type Role,
} from "@/lib/gateway/roles";
import { createMember, loadMembers, setMemberPassword, updateMember } from "@/lib/server/gateway";

export const Route = createFileRoute("/users")({ component: Page });

function Page() {
  return (
    <AppGuard>
      <UsersPage />
    </AppGuard>
  );
}

function UsersPage() {
  const qc = useQueryClient();
  const members = useQuery({ queryKey: ["members"], queryFn: () => loadMembers() });
  const [createOpen, setCreateOpen] = useState(false);
  const [passwordFor, setPasswordFor] = useState<{ userId: string; email: string } | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AssignableRole>("operator");

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const createMut = useMutation({
    mutationFn: () => createMember({ data: { email, name, password, role } }),
    onSuccess: () => {
      toast.success("账号已开通");
      setCreateOpen(false);
      setEmail("");
      setName("");
      setPassword("");
      setRole("operator");
      void qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: (input: { userId: string; role?: AssignableRole; status?: "active" | "disabled"; name?: string }) =>
      updateMember({ data: input }),
    onSuccess: () => {
      toast.success("已保存");
      void qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e.message),
  });

  const passwordMut = useMutation({
    mutationFn: () => setMemberPassword({ data: { userId: passwordFor!.userId, password: newPassword } }),
    onSuccess: () => {
      toast.success("密码已更新");
      setPasswordFor(null);
      setNewPassword("");
      setConfirm("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="账号"
        description="只有超级管理员可以开通账号、改权限、重置密码。其他人不能自行注册。"
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            开通账号
          </Button>
        }
      />

      <Card className="overflow-hidden p-0">
        <div className="divide-y divide-border">
          {(members.data ?? []).length === 0 ? (
            <p className="px-5 py-10 text-sm text-muted">还没有账号记录。</p>
          ) : (
            (members.data ?? []).map((row) => (
              <div key={row.userId} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{row.name || row.email}</span>
                    <Badge tone={row.role === "superadmin" ? "steel" : row.status === "active" ? "ok" : "danger"}>
                      {ROLE_LABEL[row.role as Role] ?? row.role}
                    </Badge>
                    {row.status !== "active" ? <Badge tone="danger">已停用</Badge> : null}
                  </div>
                  <p className="mt-1 truncate font-mono text-xs text-muted">{row.email}</p>
                  <p className="mt-1 text-xs text-faint">
                    {ROLE_HINT[row.role as Role]} · 开通 {formatTime(row.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.role !== "superadmin" ? (
                    <select
                      className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
                      value={row.role}
                      disabled={updateMut.isPending}
                      onChange={(e) =>
                        updateMut.mutate({ userId: row.userId, role: e.target.value as AssignableRole })
                      }
                    >
                      {ASSIGNABLE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPasswordFor({ userId: row.userId, email: row.email });
                      setNewPassword("");
                      setConfirm("");
                    }}
                  >
                    设置密码
                  </Button>
                  {row.role !== "superadmin" ? (
                    <Button
                      size="sm"
                      variant={row.status === "active" ? "danger" : "outline"}
                      disabled={updateMut.isPending}
                      onClick={() =>
                        updateMut.mutate({
                          userId: row.userId,
                          status: row.status === "active" ? "disabled" : "active",
                        })
                      }
                    >
                      {row.status === "active" ? "停用" : "启用"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogTitle>开通账号</DialogTitle>
          <DialogDescription>对方只能用你填写的邮箱和密码登录，不能自己注册。</DialogDescription>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createMut.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-email">邮箱</Label>
              <Input
                id="new-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-name">姓名</Label>
              <Input id="new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="选填" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pass">初始密码</Label>
              <Input
                id="new-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-role">权限</Label>
              <select
                id="new-role"
                className="h-11 w-full rounded-md border border-border bg-surface px-3 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as AssignableRole)}
              >
                {ASSIGNABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]} · {ROLE_HINT[r]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? "开通中…" : "开通"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(passwordFor)} onOpenChange={(v) => !v && setPasswordFor(null)}>
        <DialogContent>
          <DialogTitle>设置密码</DialogTitle>
          <DialogDescription>{passwordFor?.email}</DialogDescription>
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (newPassword !== confirm) {
                toast.error("两次输入的密码不一致");
                return;
              }
              passwordMut.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="set-pass">新密码</Label>
              <Input
                id="set-pass"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-pass2">确认密码</Label>
              <Input
                id="set-pass2"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setPasswordFor(null)}>
                取消
              </Button>
              <Button type="submit" disabled={passwordMut.isPending}>
                {passwordMut.isPending ? "保存中…" : "保存"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

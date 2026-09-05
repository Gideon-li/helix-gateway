export const ROLES = ["superadmin", "admin", "operator", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  superadmin: "超级管理员",
  admin: "管理员",
  operator: "运营",
  viewer: "只读",
};

export const ROLE_HINT: Record<Role, string> = {
  superadmin: "全部权限，含账号与密码管理",
  admin: "账号、密钥、上游、试运行、用量",
  operator: "密钥、试运行、用量、调用说明",
  viewer: "用量与调用说明，不能改配置",
};

export const ASSIGNABLE_ROLES = ["admin", "operator", "viewer"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export type Permission =
  | "users.manage"
  | "providers.write"
  | "providers.read"
  | "keys.write"
  | "keys.read"
  | "playground"
  | "logs.read"
  | "docs.read";

const MATRIX: Record<Role, Permission[]> = {
  superadmin: [
    "users.manage",
    "providers.write",
    "providers.read",
    "keys.write",
    "keys.read",
    "playground",
    "logs.read",
    "docs.read",
  ],
  admin: [
    "users.manage",
    "providers.write",
    "providers.read",
    "keys.write",
    "keys.read",
    "playground",
    "logs.read",
    "docs.read",
  ],
  operator: ["keys.write", "keys.read", "playground", "logs.read", "docs.read"],
  viewer: ["logs.read", "docs.read"],
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return MATRIX[role];
}

export function firstAllowedPath(role: Role): string {
  if (can(role, "keys.read")) return "/";
  if (can(role, "logs.read")) return "/logs";
  return "/docs";
}

export function pathPermission(pathname: string): Permission | null {
  if (pathname === "/users" || pathname.startsWith("/users/")) return "users.manage";
  if (pathname === "/providers" || pathname.startsWith("/providers/")) return "providers.read";
  if (pathname === "/playground" || pathname.startsWith("/playground/")) return "playground";
  if (pathname === "/logs" || pathname.startsWith("/logs/")) return "logs.read";
  if (pathname === "/docs" || pathname.startsWith("/docs/")) return "docs.read";
  if (pathname === "/") return "keys.read";
  return null;
}

import { hashPassword } from "better-auth/crypto";
import { getSql } from "@/lib/db";
import { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, LEGACY_ADMIN_EMAILS, STAFF_SEED } from "./admin";
import { newId } from "./crypto";
import { can, isRole, type AssignableRole, type Permission, type Role } from "./roles";

export type Member = {
  userId: string;
  email: string;
  name: string;
  role: Role;
  status: "active" | "disabled";
  createdAt: string;
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function asMember(row: {
  user_id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: unknown;
}): Member {
  return {
    userId: row.user_id,
    email: row.email,
    name: row.name,
    role: isRole(row.role) ? row.role : "viewer",
    status: row.status === "disabled" ? "disabled" : "active",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ""),
  };
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`select id from "user" where lower(email) = ${email} limit 1`;
  return rows[0]?.id ?? null;
}

async function upsertMember(input: {
  userId: string;
  email: string;
  name: string;
  role: Role;
  status?: "active" | "disabled";
  createdBy?: string | null;
}): Promise<void> {
  const sql = await getSql();
  const existing = await sql<{ user_id: string }>`
    select user_id from helix_members where user_id = ${input.userId} limit 1
  `;
  if (existing[0]) {
    await sql`
      update helix_members
      set email = ${input.email}, name = ${input.name}, role = ${input.role}
      where user_id = ${input.userId}
    `;
    return;
  }
  await sql`
    insert into helix_members (user_id, email, name, role, status, created_by)
    values (
      ${input.userId},
      ${input.email},
      ${input.name},
      ${input.role},
      ${input.status ?? "active"},
      ${input.createdBy ?? null}
    )
  `;
}

async function writePassword(userId: string, password: string): Promise<void> {
  const sql = await getSql();
  const hash = await hashPassword(password);
  const now = new Date().toISOString();
  const accounts = await sql<{ id: string }>`
    select id from "account" where "userId" = ${userId} and "providerId" = ${"credential"} limit 1
  `;
  if (accounts[0]) {
    await sql`
      update "account"
      set password = ${hash}, "updatedAt" = ${now}
      where id = ${accounts[0].id}
    `;
    return;
  }
  await sql`
    insert into "account" (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
    values (${newId()}, ${userId}, ${"credential"}, ${userId}, ${hash}, ${now}, ${now})
  `;
}

async function insertUser(email: string, name: string, password: string): Promise<string> {
  const sql = await getSql();
  const existing = await findUserIdByEmail(email);
  if (existing) {
    await writePassword(existing, password);
    await sql`
      update "user" set name = ${name}, "updatedAt" = CURRENT_TIMESTAMP where id = ${existing}
    `;
    return existing;
  }
  const id = newId();
  const now = new Date().toISOString();
  await sql`
    insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values (${id}, ${name}, ${email}, ${true}, ${now}, ${now})
  `;
  await writePassword(id, password);
  return id;
}

export async function ensureAccounts(): Promise<{ ok: true }> {
  const sql = await getSql();

  const taken = await sql<{ n: number }>`
    select count(*)::int as n from "user" where lower(email) = ${ADMIN_EMAIL.toLowerCase()}
  `;
  if (Number(taken[0]?.n) === 0) {
    for (const old of LEGACY_ADMIN_EMAILS) {
      await sql`
        update "user" set email = ${ADMIN_EMAIL}, "updatedAt" = CURRENT_TIMESTAMP
        where lower(email) = ${old.toLowerCase()}
      `;
      await sql`
        update "account" set "accountId" = ${ADMIN_EMAIL} where "accountId" = ${old}
      `;
    }
  }

  const superId = await insertUser(ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD);
  await upsertMember({
    userId: superId,
    email: ADMIN_EMAIL,
    name: ADMIN_NAME,
    role: "superadmin",
  });

  for (const staff of STAFF_SEED) {
    const id = await insertUser(staff.email, staff.name, staff.password);
    await upsertMember({
      userId: id,
      email: staff.email,
      name: staff.name,
      role: staff.role,
      createdBy: superId,
    });
  }

  return { ok: true };
}

export async function getMember(userId: string): Promise<Member | null> {
  const sql = await getSql();
  const rows = await sql<{
    user_id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    created_at: unknown;
  }>`
    select user_id, email, name, role, status, created_at
    from helix_members where user_id = ${userId} limit 1
  `;
  const row = rows[0];
  if (!row) {
    const users = await sql<{ email: string; name: string }>`
      select email, name from "user" where id = ${userId} limit 1
    `;
    const email = users[0]?.email?.toLowerCase();
    if (email === ADMIN_EMAIL.toLowerCase()) {
      await upsertMember({
        userId,
        email: ADMIN_EMAIL,
        name: users[0]?.name || ADMIN_NAME,
        role: "superadmin",
      });
      return getMember(userId);
    }
    return null;
  }
  return asMember(row);
}

export async function requireActive(userId: string): Promise<Member> {
  const member = await getMember(userId);
  if (!member) throw new Error("账号未开通，请联系超级管理员");
  if (member.status !== "active") throw new Error("账号已停用");
  return member;
}

export function assertCan(member: Member, permission: Permission): void {
  if (!can(member.role, permission)) throw new Error("没有权限执行此操作");
}

export async function workspaceOwnerId(): Promise<string> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select user_id from helix_members
    where role = ${"superadmin"} and status = ${"active"}
    order by created_at asc
    limit 1
  `;
  if (rows[0]?.user_id) return rows[0].user_id;
  const fallback = await findUserIdByEmail(ADMIN_EMAIL);
  if (fallback) return fallback;
  throw new Error("尚未初始化超级管理员");
}

export async function actor(userId: string): Promise<{ member: Member; workspaceId: string }> {
  const member = await requireActive(userId);
  const workspaceId = await workspaceOwnerId();
  return { member, workspaceId };
}

export async function listMembers(): Promise<Member[]> {
  const sql = await getSql();
  const rows = await sql<{
    user_id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    created_at: unknown;
  }>`
    select user_id, email, name, role, status, created_at
    from helix_members
    order by case role when 'superadmin' then 0 when 'admin' then 1 when 'operator' then 2 else 3 end,
      created_at asc
  `;
  return rows.map(asMember);
}

export async function createMember(input: {
  actorId: string;
  email: string;
  name: string;
  password: string;
  role: AssignableRole;
}): Promise<Member> {
  const email = normalizeEmail(input.email);
  if (!isEmail(email)) throw new Error("请输入有效邮箱");
  if (email === ADMIN_EMAIL.toLowerCase()) throw new Error("不能创建第二个超级管理员");
  if (input.password.length < 8) throw new Error("密码至少 8 位");
  const name = input.name.trim() || email.split("@")[0] || "成员";
  const existing = await findUserIdByEmail(email);
  if (existing) {
    const sql = await getSql();
    const member = await sql<{ n: number }>`select count(*)::int as n from helix_members where user_id = ${existing}`;
    if (Number(member[0]?.n) > 0) throw new Error("该邮箱已开通");
  }
  const userId = await insertUser(email, name, input.password);
  await upsertMember({
    userId,
    email,
    name,
    role: input.role,
    createdBy: input.actorId,
  });
  const created = await getMember(userId);
  if (!created) throw new Error("创建账号失败");
  return created;
}

export async function updateMember(input: {
  actorId: string;
  userId: string;
  name?: string;
  role?: AssignableRole;
  status?: "active" | "disabled";
}): Promise<Member> {
  const current = await getMember(input.userId);
  if (!current) throw new Error("账号不存在");
  if (current.userId === input.actorId) {
    if (input.role && input.role !== current.role) throw new Error("不能修改自己的角色");
    if (input.status === "disabled") throw new Error("不能停用自己的账号");
  }
  if (current.role === "superadmin") {
    if (input.role) throw new Error("不能修改超级管理员的角色");
    if (input.status === "disabled") throw new Error("不能停用超级管理员");
  }
  const sql = await getSql();
  const name = input.name?.trim() || current.name;
  const role = input.role ?? current.role;
  const status = input.status ?? current.status;
  await sql`
    update helix_members
    set name = ${name}, role = ${role}, status = ${status}
    where user_id = ${input.userId}
  `;
  if (input.name?.trim()) {
    await sql`
      update "user" set name = ${name}, "updatedAt" = CURRENT_TIMESTAMP where id = ${input.userId}
    `;
  }
  const next = await getMember(input.userId);
  if (!next) throw new Error("账号不存在");
  return next;
}

export async function setMemberPassword(userId: string, password: string): Promise<void> {
  if (password.length < 8) throw new Error("新密码至少 8 位");
  if (password.length > 72) throw new Error("新密码过长");
  const member = await getMember(userId);
  if (!member) throw new Error("账号不存在");
  await writePassword(userId, password);
}

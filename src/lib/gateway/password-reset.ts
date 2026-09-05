import { randomBytes } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";
import { ADMIN_EMAIL, isPrivilegedMailbox } from "./admin";
import { newId } from "./crypto";
import { fetchUnseenInbox } from "./imap";
import { sendMail, sendMailToEach } from "./mail";
import { isManagerUser, listManagerMailboxes, setMemberPassword } from "./members";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const ALLOW_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;

export type ResetMode = "admin-reply" | "awaiting-admin" | "reset-sent";

export type ResetRequestRow = {
  id: string;
  userId: string;
  email: string;
  name: string;
  kind: "self" | "member";
  status: "pending" | "approved" | "rejected" | "completed";
  requestedAt: string;
  allowUntil: string | null;
};

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

function publicOrigin(): string {
  const req = getRequest();
  if (!req) return "http://127.0.0.1:8080";
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = (forwardedHost || req.headers.get("host") || "127.0.0.1:8080").split(",")[0].trim();
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const proto = (forwardedProto || "").split(",")[0].trim();
  if (proto) return `${proto}://${host}`;
  if (host.endsWith(".grok-sandbox.com") || host.endsWith(".grok.me") || host.endsWith(".vercel.app")) {
    return `https://${host}`;
  }
  return `http://${host}`;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "");
}

function replyCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

function extractTopPost(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const top: string[] = [];
  for (const line of lines) {
    if (/^\s*>/.test(line)) break;
    if (/^(-{2,}|_{2,})/.test(line.trim())) break;
    if (/^(On .+wrote:|在.+写道：|原始邮件|Original Message)/i.test(line.trim())) break;
    top.push(line);
  }
  return top.join("\n").trim();
}

export function isPasswordKeyword(text: string): boolean {
  const top = extractTopPost(text) || text;
  const lines = top
    .split(/\n/)
    .map((line) => line.replace(/^[>\s]+/, "").trim())
    .filter(Boolean);
  if (lines.some((line) => /^密码[。.!！]*$/.test(line))) return true;
  const compact = top.replace(/\s+/g, "");
  return compact === "密码";
}

function codeFromSubject(subject: string): string | null {
  const match = /#([A-F0-9]{8})\b/i.exec(subject);
  return match?.[1]?.toUpperCase() ?? null;
}

export async function ensureResetSchema(): Promise<void> {
  const sql = await getSql();
  await sql.query(`
    create table if not exists helix_reset_requests (
      id             text primary key,
      user_id        text not null,
      email          text not null,
      name           text not null default '',
      kind           text not null,
      status         text not null default 'pending',
      reply_code     text not null,
      approve_token  text not null,
      requested_at   timestamptz not null default now(),
      decided_at     timestamptz,
      decided_by     text,
      allow_until    timestamptz
    )
  `);
  await sql.query(
    `create unique index if not exists helix_reset_requests_reply_code_idx on helix_reset_requests (reply_code)`,
  );
  await sql.query(
    `create unique index if not exists helix_reset_requests_approve_token_idx on helix_reset_requests (approve_token)`,
  );
  await sql.query(
    `create index if not exists helix_reset_requests_user_idx on helix_reset_requests (user_id, status, requested_at desc)`,
  );
}

async function issueResetLink(input: { userId: string; email: string; name: string }): Promise<string> {
  const sql = await getSql();
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + TOKEN_TTL_MS);
  await sql`
    insert into "verification" ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt")
    values (
      ${newId()},
      ${`reset-password:${token}`},
      ${input.userId},
      ${expires.toISOString()},
      ${now.toISOString()},
      ${now.toISOString()}
    )
  `;
  const origin = publicOrigin();
  const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await sendMail({
      to: input.email,
      replyTo: ADMIN_EMAIL,
      subject: "Helix 智枢 · 设置新密码",
      text: [
        `${input.name || "你好"}，`,
        "",
        "请在一小时内打开下面的链接设置新密码：",
        "",
        link,
        "",
        "如果不是你本人操作，请忽略这封信，密码不会改变。",
        "",
        "— Helix 智枢",
      ].join("\n"),
    });
  } catch {
    /* token remains valid; user can retry 忘记密码 */
  }
  return token;
}

async function markApproved(id: string, decidedBy: string): Promise<void> {
  const sql = await getSql();
  const until = new Date(Date.now() + ALLOW_TTL_MS).toISOString();
  await sql`
    update helix_reset_requests
    set status = ${"approved"},
        decided_at = ${new Date().toISOString()},
        decided_by = ${decidedBy},
        allow_until = ${until}
    where id = ${id}
  `;
}

async function loadRequestByCode(code: string) {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    user_id: string;
    email: string;
    name: string;
    kind: string;
    status: string;
    approve_token: string;
  }>`
    select id, user_id, email, name, kind, status, approve_token
    from helix_reset_requests where reply_code = ${code} limit 1
  `;
  return rows[0] ?? null;
}

async function fulfillRequest(row: {
  id: string;
  user_id: string;
  email: string;
  name: string;
  kind: string;
  status: string;
}, decidedBy: string): Promise<{ resetToken: string }> {
  if (row.status === "rejected") throw new Error("该申请已被拒绝");
  if (row.status === "completed") throw new Error("该申请已完成");
  await markApproved(row.id, decidedBy);
  const token = await issueResetLink({ userId: row.user_id, email: row.email, name: row.name });
  return { resetToken: token };
}

export async function requestPasswordReset(emailRaw: string): Promise<{ ok: true; mode: ResetMode }> {
  await ensureResetSchema();
  const email = normalizeEmail(emailRaw);
  if (!isEmail(email)) throw new Error("请输入有效邮箱");

  const sql = await getSql();
  const users = await sql<{ id: string; name: string }>`
    select id, name from "user" where lower(email) = ${email} limit 1
  `;
  const user = users[0];
  if (!user) return { ok: true, mode: "awaiting-admin" };

  const members = await sql<{ status: string; role: string; name: string }>`
    select status, role, name from helix_members where user_id = ${user.id} limit 1
  `;
  const member = members[0];
  if (member && member.status === "disabled") return { ok: true, mode: "awaiting-admin" };

  const recent = await sql<{ n: number }>`
    select count(*)::int as n from helix_reset_requests
    where user_id = ${user.id}
      and requested_at > ${new Date(Date.now() - RATE_WINDOW_MS).toISOString()}
  `;
  if (Number(recent[0]?.n) >= RATE_MAX) return { ok: true, mode: "awaiting-admin" };

  const manager = (await isManagerUser(user.id)) || isPrivilegedMailbox(email);
  const open = await sql<{
    id: string;
    kind: string;
    status: string;
    allow_until: unknown;
    requested_at: unknown;
  }>`
    select id, kind, status, allow_until, requested_at
    from helix_reset_requests
    where user_id = ${user.id}
    order by requested_at desc
    limit 1
  `;
  const latest = open[0];
  if (latest?.status === "approved" && latest.allow_until && new Date(asIso(latest.allow_until)).getTime() > Date.now()) {
    await issueResetLink({ userId: user.id, email, name: member?.name || user.name });
    return { ok: true, mode: "reset-sent" };
  }

  if (!manager && latest?.status === "pending") {
    const age = Date.now() - new Date(asIso(latest.requested_at)).getTime();
    if (age < RATE_WINDOW_MS) return { ok: true, mode: "awaiting-admin" };
  }

  const kind = manager ? "self" : "member";
  const code = replyCode();
  const approveToken = randomBytes(24).toString("base64url");
  const id = newId();
  const name = member?.name || user.name || email;
  await sql`
    insert into helix_reset_requests
      (id, user_id, email, name, kind, status, reply_code, approve_token, requested_at)
    values (
      ${id},
      ${user.id},
      ${email},
      ${name},
      ${kind},
      ${"pending"},
      ${code},
      ${approveToken},
      ${new Date().toISOString()}
    )
  `;

  const origin = publicOrigin();
  const confirmLink = `${origin}/approve-reset?token=${encodeURIComponent(approveToken)}`;

  if (kind === "self") {
    await sendMail({
      to: email,
      replyTo: ADMIN_EMAIL,
      messageId: `helix-reset-${id}@helix-gateway`,
      subject: `Helix 智枢 · 回复「密码」 #${code}`,
      text: [
        `${name}，`,
        "",
        "有人请求重置你的 Helix 智枢管理员密码。请回复本邮件，正文只写：",
        "",
        "密码",
        "",
        "确认后你会收到设置新密码的链接。请保留邮件主题中的编号。",
        "",
        "也可以直接打开确认链接（与回复「密码」效果相同）：",
        confirmLink,
        "",
        "如果不是你本人操作，请忽略这封信。",
        "",
        "— Helix 智枢",
      ].join("\n"),
    });
    return { ok: true, mode: "admin-reply" };
  }

  const managers = await listManagerMailboxes();
  const notify = managers.map((row) => row.email);
  if (notify.length === 0) notify.push(ADMIN_EMAIL);
  try {
    await sendMailToEach(notify, {
      replyTo: ADMIN_EMAIL,
      messageId: `helix-reset-${id}@helix-gateway`,
      subject: `Helix 智枢 · 用户申请重置密码 #${code}`,
      text: [
        "管理员你好，",
        "",
        `用户 ${name} <${email}> 申请重置 Helix 智枢密码。`,
        "",
        "请回复本邮件，正文只写「密码」以允许对方重置；两位管理员都可以处理。",
        "也可以打开下面的链接允许，或登录控制台「账号」页批准：",
        "",
        confirmLink,
        `${origin}/users`,
        "",
        "允许后，对方会收到设置新密码的邮件。",
        "",
        "— Helix 智枢",
      ].join("\n"),
    });
  } catch {
    /* 控制台「账号」页仍可批准 */
  }
  return { ok: true, mode: "awaiting-admin" };
}

export async function completePasswordReset(tokenRaw: string, password: string): Promise<{ ok: true }> {
  await ensureResetSchema();
  const token = tokenRaw.trim();
  if (!token) throw new Error("重置链接无效或已过期");
  if (password.length < 8) throw new Error("新密码至少 8 位");
  if (password.length > 72) throw new Error("新密码过长");

  const sql = await getSql();
  const rows = await sql<{ id: string; value: string; expiresAt: unknown }>`
    select id, value, "expiresAt" from "verification"
    where "identifier" = ${`reset-password:${token}`}
    limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("重置链接无效或已过期");
  if (new Date(asIso(row.expiresAt)).getTime() < Date.now()) {
    await sql`delete from "verification" where id = ${row.id}`;
    throw new Error("重置链接无效或已过期");
  }
  await setMemberPassword(row.value, password);
  await sql`delete from "verification" where id = ${row.id}`;
  await sql`
    update helix_reset_requests
    set status = ${"completed"}
    where user_id = ${row.value} and status = ${"approved"}
  `;
  return { ok: true };
}

export async function listResetRequests(): Promise<ResetRequestRow[]> {
  await ensureResetSchema();
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    user_id: string;
    email: string;
    name: string;
    kind: string;
    status: string;
    requested_at: unknown;
    allow_until: unknown;
  }>`
    select id, user_id, email, name, kind, status, requested_at, allow_until
    from helix_reset_requests
    where kind = ${"member"}
      and (
        status = ${"pending"}
        or (status = ${"approved"} and allow_until > ${new Date().toISOString()})
      )
    order by requested_at desc
    limit 40
  `;
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    kind: row.kind === "self" ? "self" : "member",
    status:
      row.status === "approved" || row.status === "rejected" || row.status === "completed"
        ? row.status
        : "pending",
    requestedAt: asIso(row.requested_at),
    allowUntil: row.allow_until ? asIso(row.allow_until) : null,
  }));
}

export async function decideResetRequest(input: {
  actorId: string;
  requestId: string;
  action: "approve" | "reject";
}): Promise<{ ok: true }> {
  await ensureResetSchema();
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    user_id: string;
    email: string;
    name: string;
    kind: string;
    status: string;
  }>`
    select id, user_id, email, name, kind, status
    from helix_reset_requests where id = ${input.requestId} limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("申请不存在");
  if (row.kind !== "member") throw new Error("管理员重置请用邮箱回复「密码」");
  if (input.action === "reject") {
    if (row.status !== "pending") throw new Error("该申请已处理");
    await sql`
      update helix_reset_requests
      set status = ${"rejected"},
          decided_at = ${new Date().toISOString()},
          decided_by = ${input.actorId}
      where id = ${row.id}
    `;
    return { ok: true };
  }
  await fulfillRequest(row, input.actorId);
  return { ok: true };
}

export async function approveByMailToken(
  tokenRaw: string,
): Promise<{ ok: true; kind: "self" | "member"; resetToken?: string; email: string }> {
  await ensureResetSchema();
  const token = tokenRaw.trim();
  if (!token) throw new Error("确认链接无效或已过期");
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    user_id: string;
    email: string;
    name: string;
    kind: string;
    status: string;
    requested_at: unknown;
  }>`
    select id, user_id, email, name, kind, status, requested_at
    from helix_reset_requests where approve_token = ${token} limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("确认链接无效或已过期");
  if (Date.now() - new Date(asIso(row.requested_at)).getTime() > ALLOW_TTL_MS) {
    throw new Error("确认链接无效或已过期");
  }
  const decidedBy = row.kind === "self" ? row.user_id : "mail";
  const result = await fulfillRequest(row, decidedBy);
  return {
    ok: true,
    kind: row.kind === "self" ? "self" : "member",
    resetToken: row.kind === "self" ? result.resetToken : undefined,
    email: row.email,
  };
}

export async function processInboundMail(): Promise<{ processed: number }> {
  await ensureResetSchema();
  let mails: Awaited<ReturnType<typeof fetchUnseenInbox>> = [];
  try {
    mails = await fetchUnseenInbox();
  } catch {
    return { processed: 0 };
  }
  let processed = 0;
  for (const mail of mails) {
    if (!isPasswordKeyword(mail.text) && !isPasswordKeyword(mail.subject)) continue;
    const code = codeFromSubject(mail.subject);
    if (code) {
      const row = await loadRequestByCode(code);
      if (!row || row.status === "rejected" || row.status === "completed") continue;
      if (row.kind === "self") {
        if (normalizeEmail(mail.from) !== normalizeEmail(row.email)) continue;
        await fulfillRequest(row, row.user_id).catch(() => undefined);
        processed += 1;
        continue;
      }
      const managers = await listManagerMailboxes();
      const actor = managers.find((item) => item.email === normalizeEmail(mail.from));
      if (!actor) continue;
      await fulfillRequest(row, actor.userId).catch(() => undefined);
      processed += 1;
      continue;
    }
    if (isPrivilegedMailbox(mail.from) || (await isManagerUserFromEmail(mail.from))) {
      const sql = await getSql();
      const users = await sql<{ id: string; name: string }>`
        select id, name from "user" where lower(email) = ${normalizeEmail(mail.from)} limit 1
      `;
      if (!users[0]) continue;
      const token = await issueResetLink({
        userId: users[0].id,
        email: normalizeEmail(mail.from),
        name: users[0].name,
      }).catch(() => null);
      if (token) processed += 1;
    }
  }
  return { processed };
}

async function isManagerUserFromEmail(email: string): Promise<boolean> {
  const managers = await listManagerMailboxes();
  return managers.some((row) => row.email === normalizeEmail(email));
}

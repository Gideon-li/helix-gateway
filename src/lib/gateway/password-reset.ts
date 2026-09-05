import { randomBytes } from "node:crypto";
import { getRequest } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";
import { ADMIN_EMAIL, LEGACY_ADMIN_EMAILS } from "./admin";
import { newId } from "./crypto";
import { sendMail } from "./mail";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;

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

export async function migrateAdminMailbox(): Promise<{ updated: boolean }> {
  const sql = await getSql();
  const taken = await sql<{ n: number }>`
    select count(*)::int as n from "user" where lower(email) = ${ADMIN_EMAIL.toLowerCase()}
  `;
  if (Number(taken[0]?.n) > 0) return { updated: false };

  let updated = false;
  for (const old of LEGACY_ADMIN_EMAILS) {
    const rows = await sql<{ id: string }>`
      update "user"
      set email = ${ADMIN_EMAIL}, "updatedAt" = CURRENT_TIMESTAMP
      where lower(email) = ${old.toLowerCase()}
      returning id
    `;
    if (rows[0]?.id) {
      await sql`
        update "account" set "accountId" = ${ADMIN_EMAIL} where "accountId" = ${old}
      `;
      updated = true;
    }
  }
  return { updated };
}

export async function requestPasswordReset(emailRaw: string): Promise<{ ok: true }> {
  const email = normalizeEmail(emailRaw);
  if (!isEmail(email)) throw new Error("请输入有效邮箱");

  const sql = await getSql();
  const users = await sql<{ id: string; name: string }>`
    select id, name from "user" where lower(email) = ${email} limit 1
  `;
  const user = users[0];
  if (!user) return { ok: true };

  const recent = await sql<{ n: number }>`
    select count(*)::int as n from "verification"
    where "value" = ${user.id}
      and "identifier" like ${"reset-password:%"}
      and "createdAt" > ${new Date(Date.now() - RATE_WINDOW_MS).toISOString()}
  `;
  if (Number(recent[0]?.n) >= RATE_MAX) return { ok: true };

  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + TOKEN_TTL_MS);
  await sql`
    insert into "verification" ("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt")
    values (
      ${newId()},
      ${`reset-password:${token}`},
      ${user.id},
      ${expires.toISOString()},
      ${now.toISOString()},
      ${now.toISOString()}
    )
  `;

  const origin = publicOrigin();
  const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: "Helix 智枢 · 重置密码",
    text: [
      `${user.name || "你好"}，`,
      "",
      "有人请求重置 Helix 智枢控制台的密码。若是你本人，请在一小时内打开下面的链接设置新密码：",
      "",
      link,
      "",
      "如果不是你本人操作，请忽略这封信，密码不会改变。",
      "",
      "— Helix 智枢",
    ].join("\n"),
  });

  return { ok: true };
}

export async function completePasswordReset(tokenRaw: string, password: string): Promise<{ ok: true }> {
  const token = tokenRaw.trim();
  if (!token) throw new Error("重置链接无效或已过期");
  if (password.length < 8) throw new Error("新密码至少 8 位");
  if (password.length > 72) throw new Error("新密码过长");

  const { auth } = await import("@/lib/auth/server");
  const result = await auth.api.resetPassword({
    body: { newPassword: password, token },
  });
  if (!result?.status) throw new Error("重置链接无效或已过期");
  return { ok: true };
}

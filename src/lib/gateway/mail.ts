import { resolveMx } from "node:dns/promises";
import { connect as netConnect, type Socket } from "node:net";
import { connect as tlsConnect, type TLSSocket } from "node:tls";

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
};

type SmtpConn = Socket | TLSSocket;

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function stampDate(): string {
  return new Date().toUTCString();
}

function quoteAddress(raw: string): string {
  return raw.trim().toLowerCase();
}

async function lookupMx(domain: string): Promise<string[]> {
  try {
    const records = await resolveMx(domain);
    return records
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function connectPort(host: string, port: number, timeoutMs: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`连接 ${host}:${port} 超时`));
    }, timeoutMs);
    socket.once("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function attachBuffer(socket: SmtpConn): { readReply: (timeoutMs?: number) => Promise<{ code: number; text: string }> } {
  let buf = "";
  const waiters: Array<(chunk: string) => void> = [];

  socket.on("data", (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    if (waiters.length > 0) waiters.shift()?.(text);
    else buf += text;
  });

  function take(timeoutMs: number): Promise<string> {
    if (buf) {
      const current = buf;
      buf = "";
      return Promise.resolve(current);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.indexOf(onChunk);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error("邮件服务器响应超时"));
      }, timeoutMs);
      const onChunk = (text: string) => {
        clearTimeout(timer);
        resolve(text);
      };
      waiters.push(onChunk);
    });
  }

  async function readReply(timeoutMs = 15_000): Promise<{ code: number; text: string }> {
    let text = "";
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      text += await take(Math.max(200, deadline - Date.now()));
      const parts = text.split(/\r?\n/);
      for (let i = 0; i < parts.length - 1; i += 1) {
        const line = parts[i];
        const match = /^(?<code>\d{3})(?<sep>[ -])/.exec(line);
        if (match?.groups?.sep === " ") {
          return { code: Number(match.groups.code), text };
        }
      }
    }
    throw new Error("邮件服务器响应超时");
  }

  return { readReply };
}

function upgradeTls(socket: Socket, servername: string): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const tls = tlsConnect({ socket, servername, rejectUnauthorized: true }, () => resolve(tls));
    tls.once("error", reject);
  });
}

function dotStuff(body: string): string {
  return body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

async function session(host: string, mail: OutboundMail, from: string): Promise<void> {
  const socket = await connectPort(host, 25, 8_000);
  socket.setKeepAlive(true);
  let conn: SmtpConn = socket;
  let io = attachBuffer(conn);

  const command = async (line: string, expect: number[]) => {
    conn.write(`${line}\r\n`);
    const reply = await io.readReply();
    if (!expect.includes(reply.code)) {
      throw new Error(`SMTP ${reply.code}: ${reply.text.trim().slice(0, 180)}`);
    }
    return reply.text;
  };

  try {
    const greet = await io.readReply();
    if (greet.code !== 220) throw new Error(`SMTP 问候失败: ${greet.text.trim()}`);
    let ehlo = await command("EHLO helix-gateway", [250]);
    if (/250[\s-]STARTTLS/i.test(ehlo) && !(conn as TLSSocket).encrypted) {
      await command("STARTTLS", [220]);
      socket.removeAllListeners("data");
      conn = await upgradeTls(socket, host);
      io = attachBuffer(conn);
      ehlo = await command("EHLO helix-gateway", [250]);
    }
    await command(`MAIL FROM:<${from}>`, [250]);
    await command(`RCPT TO:<${mail.to}>`, [250, 251]);
    await command("DATA", [354]);
    const payload = [
      `From: Helix 智枢 <${from}>`,
      `To: ${mail.to}`,
      `Subject: ${encodeSubject(mail.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      `Date: ${stampDate()}`,
      "Auto-Submitted: auto-generated",
      "",
      dotStuff(mail.text),
      ".",
    ].join("\r\n");
    conn.write(`${payload}\r\n`);
    const dataReply = await io.readReply();
    if (dataReply.code !== 250) {
      throw new Error(`邮件未被接收: ${dataReply.text.trim().slice(0, 180)}`);
    }
    await command("QUIT", [221, 250]).catch(() => undefined);
  } finally {
    conn.destroy();
  }
}

async function sendViaFormSubmit(mail: OutboundMail): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18_000);
  try {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(mail.to)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Origin: "https://formsubmit.co",
        Referer: "https://formsubmit.co/",
      },
      body: JSON.stringify({
        _subject: mail.subject,
        _template: "box",
        _captcha: "false",
        message: mail.text,
      }),
      signal: controller.signal,
    });
    const raw = await res.text();
    let json: { success?: string | boolean; message?: string } = {};
    try {
      json = JSON.parse(raw) as { success?: string | boolean; message?: string };
    } catch {
      json = { message: raw.slice(0, 180) };
    }
    const success = json.success === true || json.success === "true";
    const msg = String(json.message ?? "");
    if (success || /activat/i.test(msg) || /sent you an email/i.test(msg)) return;
    throw new Error(msg || `邮件服务返回 ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function sendMail(mail: OutboundMail): Promise<void> {
  const to = quoteAddress(mail.to);
  const at = to.lastIndexOf("@");
  if (at < 1) throw new Error("邮箱格式不正确");
  const domain = to.slice(at + 1);
  const payload = { ...mail, to };

  try {
    await sendViaFormSubmit(payload);
    return;
  } catch (formErr) {
    const hosts = await lookupMx(domain);
    const errors = [formErr instanceof Error ? formErr.message : String(formErr)];
    for (const host of hosts) {
      try {
        await session(host, payload, "noreply@helix.dev");
        return;
      } catch (err) {
        errors.push(`${host}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error(`无法投递重置邮件（${errors[0]}）`);
  }
}

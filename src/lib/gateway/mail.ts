import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { ADMIN_EMAIL, SMTP_AUTH_CODE, SMTP_HOST, SMTP_PORT, SMTP_USER } from "./admin";

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  messageId?: string;
};

function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function b64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function quoteAddress(raw: string): string {
  return raw.trim().toLowerCase();
}

function connectTls(host: string, port: number, timeoutMs: number): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({ host, port, servername: host, rejectUnauthorized: true }, () => {
      clearTimeout(timer);
      resolve(socket);
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`连接 ${host}:${port} 超时`));
    }, timeoutMs);
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function attachBuffer(socket: TLSSocket) {
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

  async function readReply(timeoutMs = 6_000): Promise<{ code: number; text: string }> {
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

function dotStuff(body: string): string {
  return body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
}

async function sendViaQq(mail: OutboundMail): Promise<void> {
  const socket = await connectTls(SMTP_HOST, SMTP_PORT, 4_000);
  const io = attachBuffer(socket);
  const command = async (line: string, expect: number[]) => {
    socket.write(`${line}\r\n`);
    const reply = await io.readReply();
    if (!expect.includes(reply.code)) {
      throw new Error(`SMTP ${reply.code}: ${reply.text.trim().slice(0, 180)}`);
    }
    return reply;
  };

  try {
    const greet = await io.readReply();
    if (greet.code !== 220) throw new Error(`SMTP 问候失败: ${greet.text.trim()}`);
    await command("EHLO helix-gateway", [250]);
    await command("AUTH LOGIN", [334]);
    await command(b64(SMTP_USER), [334]);
    await command(b64(SMTP_AUTH_CODE), [235]);
    await command(`MAIL FROM:<${ADMIN_EMAIL}>`, [250]);
    await command(`RCPT TO:<${mail.to}>`, [250, 251]);
    await command("DATA", [354]);
    const headers = [
      `From: Helix 智枢 <${ADMIN_EMAIL}>`,
      `To: ${mail.to}`,
      mail.replyTo ? `Reply-To: ${mail.replyTo}` : "",
      mail.messageId ? `Message-ID: <${mail.messageId}>` : "",
      `Subject: ${encodeSubject(mail.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      `Date: ${new Date().toUTCString()}`,
    ].filter(Boolean);
    const payload = [...headers, "", dotStuff(mail.text), "."].join("\r\n");
    socket.write(`${payload}\r\n`);
    const dataReply = await io.readReply();
    if (dataReply.code !== 250) {
      throw new Error(`邮件未被接收: ${dataReply.text.trim().slice(0, 180)}`);
    }
    await command("QUIT", [221, 250]).catch(() => undefined);
  } finally {
    socket.destroy();
  }
}

async function sendViaFormSubmit(mail: OutboundMail): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
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
  const payload = { ...mail, to };
  try {
    await sendViaQq(payload);
  } catch {
    await sendViaFormSubmit(payload);
  }
}

export async function sendMailToEach(addresses: string[], mail: Omit<OutboundMail, "to">): Promise<void> {
  const unique = [...new Set(addresses.map(quoteAddress).filter((row) => row.includes("@")))];
  const errors: string[] = [];
  for (const to of unique) {
    try {
      await sendMail({ ...mail, to });
    } catch (err) {
      errors.push(`${to}: ${err instanceof Error ? err.message : "发送失败"}`);
    }
  }
  if (unique.length > 0 && errors.length === unique.length) {
    throw new Error(errors[0] || "邮件发送失败");
  }
}

import { connect as tlsConnect, type TLSSocket } from "node:tls";
import { ADMIN_EMAIL, IMAP_HOST, IMAP_PORT, SMTP_AUTH_CODE } from "./admin";

export type InboundMail = {
  from: string;
  subject: string;
  text: string;
};

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

function attachReader(socket: TLSSocket) {
  let buf = Buffer.alloc(0);
  const waiters: Array<(chunk: Buffer) => void> = [];
  socket.on("data", (chunk: Buffer | string) => {
    const data = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    if (waiters.length > 0) waiters.shift()?.(data);
    else buf = Buffer.concat([buf, data]);
  });

  async function take(timeoutMs: number): Promise<Buffer> {
    if (buf.length > 0) {
      const current = buf;
      buf = Buffer.alloc(0);
      return current;
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = waiters.indexOf(onChunk);
        if (idx >= 0) waiters.splice(idx, 1);
        reject(new Error("邮件服务器响应超时"));
      }, timeoutMs);
      const onChunk = (data: Buffer) => {
        clearTimeout(timer);
        resolve(data);
      };
      waiters.push(onChunk);
    });
  }

  function complete(acc: Buffer, tag: string): boolean {
    let i = 0;
    while (i < acc.length) {
      const nl = acc.indexOf(0x0a, i);
      if (nl < 0) return false;
      const line = acc.subarray(i, nl).toString("utf8").replace(/\r$/, "");
      const lit = /\{(\d+)\}$/.exec(line);
      if (lit) {
        const size = Number(lit[1]);
        const dataStart = nl + 1;
        if (acc.length < dataStart + size) return false;
        i = dataStart + size;
        continue;
      }
      if (line.startsWith(`${tag} `) || (tag === "*" && line.startsWith("* "))) return true;
      i = nl + 1;
    }
    return false;
  }

  async function readTagged(tag: string, timeoutMs = 18_000): Promise<string> {
    let acc = Buffer.alloc(0);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      acc = Buffer.concat([acc, await take(Math.max(200, deadline - Date.now()))]);
      if (complete(acc, tag)) return acc.toString("utf8");
    }
    throw new Error("邮件服务器响应超时");
  }

  return { readTagged };
}

function decodeMimeWord(raw: string): string {
  return raw.replace(/=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g, (_m, _cs, enc, data: string) => {
    try {
      if (String(enc).toUpperCase() === "B") return Buffer.from(data, "base64").toString("utf8");
      const q = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x, h) =>
        String.fromCharCode(Number.parseInt(h, 16)),
      );
      return q;
    } catch {
      return data;
    }
  });
}

function decodeQuotedPrintable(raw: string): string {
  const unpacked = raw.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_m, h) =>
    String.fromCharCode(Number.parseInt(h, 16)),
  );
  return unpacked;
}

function headerValue(headers: string, name: string): string {
  const re = new RegExp(`^${name}:\\s*(.*(?:\\r?\\n[ \\t].*)*)`, "im");
  const match = re.exec(headers);
  if (!match) return "";
  return decodeMimeWord(match[1].replace(/\r?\n[ \t]+/g, " ").trim());
}

function parseFrom(raw: string): string {
  const angle = /<([^>]+@[^>]+)>/.exec(raw);
  if (angle?.[1]) return angle[1].trim().toLowerCase();
  const bare = /([^\s<>]+@[^\s<>]+)/.exec(raw);
  return (bare?.[1] ?? "").trim().toLowerCase();
}

function extractFetchBodies(raw: string): { headers: string; text: string } | null {
  const headerMatch = /BODY\[HEADER(?:\.FIELDS \([^)]+\))?\]\s*(?:\{(\d+)\}\r?\n)?/i.exec(raw);
  const textMatch = /BODY\[TEXT\]\s*(?:\{(\d+)\}\r?\n)?/i.exec(raw);
  if (!headerMatch) return null;
  const afterHeader = raw.slice(headerMatch.index + headerMatch[0].length);
  let headers = afterHeader;
  if (headerMatch[1]) headers = afterHeader.slice(0, Number(headerMatch[1]));
  else {
    const end = afterHeader.search(/\r?\n\)|\r?\n BODY/i);
    headers = end >= 0 ? afterHeader.slice(0, end) : afterHeader;
  }
  let text = "";
  if (textMatch) {
    const afterText = raw.slice(textMatch.index + textMatch[0].length);
    if (textMatch[1]) text = afterText.slice(0, Number(textMatch[1]));
    else {
      const end = afterText.search(/\r?\n\)/);
      text = (end >= 0 ? afterText.slice(0, end) : afterText).replace(/^"|"$/g, "");
    }
  }
  if (/quoted-printable/i.test(headers)) text = decodeQuotedPrintable(text);
  if (/base64/i.test(headers) && /^[A-Za-z0-9+/=\r\n]+$/.test(text.trim().slice(0, 80))) {
    try {
      text = Buffer.from(text.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      /* keep */
    }
  }
  return { headers, text };
}

export async function fetchUnseenInbox(): Promise<InboundMail[]> {
  const socket = await connectTls(IMAP_HOST, IMAP_PORT, 4_000);
  const io = attachReader(socket);
  let tagN = 0;
  const tag = () => `A${(tagN += 1)}`;
  const command = async (line: string) => {
    const id = tag();
    socket.write(`${id} ${line}\r\n`);
    const reply = await io.readTagged(id);
    if (new RegExp(`^${id} NO|^${id} BAD`, "m").test(reply)) {
      throw new Error(reply.split(/\r?\n/).find((row) => row.startsWith(id)) ?? "IMAP 失败");
    }
    return reply;
  };

  try {
    await io.readTagged("*", 12_000).catch(() => undefined);
    await command(`LOGIN "${ADMIN_EMAIL}" "${SMTP_AUTH_CODE}"`);
    await command("SELECT INBOX");
    const search = await command("SEARCH UNSEEN");
    const ids = [...(search.match(/\* SEARCH[^\r\n]*/i)?.[0].match(/\d+/g) ?? [])].map(Number).filter((n) => n > 0);
    const out: InboundMail[] = [];
    for (const id of ids.slice(0, 20)) {
      try {
        const fetched = await command(
          `FETCH ${id} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT IN-REPLY-TO)] BODY.PEEK[TEXT])`,
        );
        const parsed = extractFetchBodies(fetched);
        if (!parsed) continue;
        const from = parseFrom(headerValue(parsed.headers, "From"));
        const subject = headerValue(parsed.headers, "Subject");
        out.push({ from, subject, text: parsed.text });
        await command(`STORE ${id} +FLAGS.SILENT (\\Seen)`).catch(() => undefined);
      } catch {
        /* skip one message */
      }
    }
    await command("LOGOUT").catch(() => undefined);
    return out;
  } finally {
    socket.destroy();
  }
}

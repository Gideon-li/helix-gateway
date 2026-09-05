export const ACCESS_STORAGE_KEY = "helix.access.v1";

export type AccessConfig = {
  ip: string;
  domain: string;
  port: string;
};

export const EMPTY_ACCESS: AccessConfig = { ip: "", domain: "", port: "" };

const PLATFORM_HOST = /(grok-sandbox\.com|vercel\.app|^localhost$|^127\.0\.0\.1$|^\[::1\])$/i;

export function stripHost(raw: string): string {
  let s = raw.trim();
  s = s.replace(/^https?:\/\//i, "");
  const slash = s.indexOf("/");
  if (slash >= 0) s = s.slice(0, slash);
  return s;
}

export function parseHostPort(raw: string): { host: string; port: string } {
  const stripped = stripHost(raw);
  const v6 = stripped.match(/^\[([^\]]+)\](?::(\d{1,5}))?$/);
  if (v6) return { host: v6[1], port: v6[2] ?? "" };

  const colon = stripped.lastIndexOf(":");
  if (colon > 0 && /^\d{1,5}$/.test(stripped.slice(colon + 1))) {
    const maybeHost = stripped.slice(0, colon);
    if (!maybeHost.includes(":") || maybeHost.includes(".")) {
      return { host: maybeHost, port: stripped.slice(colon + 1) };
    }
  }
  return { host: stripped.replace(/^\[/, "").replace(/\]$/, ""), port: "" };
}

export function isIPv4(host: string): boolean {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return false;
  return host.split(".").every((part) => {
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

export function isIPv6(host: string): boolean {
  const h = host.replace(/^\[/, "").replace(/\]$/, "");
  return h.includes(":") && /^[0-9a-f:]+$/i.test(h);
}

export function isIpHost(host: string): boolean {
  const h = host.replace(/^\[/, "").replace(/\]$/, "");
  return isIPv4(h) || isIPv6(h);
}

export function httpOrigin(host: string, port = ""): string {
  const h = host.trim();
  if (!h) return "";
  const bare = h.replace(/^\[/, "").replace(/\]$/, "");
  const hostPart = isIPv6(bare) ? `[${bare}]` : bare;
  const p = port.trim();
  const portPart = p && p !== "80" ? `:${p}` : "";
  return `http://${hostPart}${portPart}`;
}

export function helixBaseUrl(host: string, port = ""): string {
  const parsed = parseHostPort(host);
  const origin = httpOrigin(parsed.host, port || parsed.port);
  return origin ? `${origin}/v1` : "";
}

export function endpoints(config: AccessConfig): { ip: string; domain: string } {
  return {
    ip: config.ip.trim() ? helixBaseUrl(config.ip, config.port) : "",
    domain: config.domain.trim() ? helixBaseUrl(config.domain) : "",
  };
}

export function placeholderBase(kind: "ip" | "domain"): string {
  return kind === "ip" ? "http://你的服务器IP/v1" : "http://你的域名/v1";
}

function shouldIgnoreHost(hostname: string): boolean {
  return PLATFORM_HOST.test(hostname);
}

export function guessFromLocation(): AccessConfig {
  if (typeof window === "undefined") return { ...EMPTY_ACCESS };
  const { hostname, port } = window.location;
  const p = port && port !== "80" && port !== "443" ? port : "";
  if (shouldIgnoreHost(hostname)) return { ...EMPTY_ACCESS };
  if (isIpHost(hostname)) {
    return { ip: hostname.replace(/^\[/, "").replace(/\]$/, ""), domain: "", port: p };
  }
  return { ip: "", domain: hostname, port: p };
}

export function loadAccess(): AccessConfig {
  const guessed = guessFromLocation();
  try {
    const raw = localStorage.getItem(ACCESS_STORAGE_KEY);
    if (!raw) return guessed;
    const saved = JSON.parse(raw) as Partial<AccessConfig>;
    return {
      ip: String(saved.ip ?? "").trim() || guessed.ip,
      domain: String(saved.domain ?? "").trim() || guessed.domain,
      port: String(saved.port ?? "").trim() || guessed.port,
    };
  } catch {
    return guessed;
  }
}

export function saveAccess(config: AccessConfig): void {
  localStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(config));
}

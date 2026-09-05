import { useEffect, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type AccessConfig,
  EMPTY_ACCESS,
  endpoints,
  loadAccess,
  parseHostPort,
  placeholderBase,
  saveAccess,
} from "@/lib/gateway/access";
import { cn } from "@/lib/utils";

export function useAccessEndpoints() {
  const [config, setConfigState] = useState<AccessConfig>(EMPTY_ACCESS);

  useEffect(() => {
    setConfigState(loadAccess());
  }, []);

  function setConfig(patch: Partial<AccessConfig>) {
    setConfigState((prev) => {
      const next = { ...prev, ...patch };
      saveAccess(next);
      return next;
    });
  }

  return { config, setConfig, urls: endpoints(config) };
}

export function AccessEndpoints({
  compact = false,
  config: configProp,
  setConfig: setConfigProp,
}: {
  compact?: boolean;
  config?: AccessConfig;
  setConfig?: (patch: Partial<AccessConfig>) => void;
}) {
  const local = useAccessEndpoints();
  const config = configProp ?? local.config;
  const setConfig = setConfigProp ?? local.setConfig;
  const urls = endpoints(config);

  function commitIp(raw: string) {
    const parsed = parseHostPort(raw);
    setConfig({
      ip: parsed.host,
      port: parsed.port || config.port,
    });
  }

  function commitDomain(raw: string) {
    const parsed = parseHostPort(raw);
    setConfig({ domain: parsed.port ? `${parsed.host}:${parsed.port}` : parsed.host });
  }

  return (
    <div className="space-y-4">
      {compact ? null : (
        <Card className="p-5">
          <p className="text-xs tracking-wide text-faint uppercase">接入地址 · HTTP</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            协议固定为 HTTP。填公网 IP、域名，或两个都填——接口同时认，应用里用任意一个 Base URL 即可。
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,1.6fr)]">
            <div className="space-y-1.5">
              <Label htmlFor="access-ip">服务器 IP</Label>
              <Input
                id="access-ip"
                inputMode="decimal"
                autoComplete="off"
                placeholder="例如 47.236.12.34"
                value={config.ip}
                onChange={(e) => setConfig({ ip: e.target.value })}
                onBlur={(e) => commitIp(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="access-port">端口</Label>
              <Input
                id="access-port"
                inputMode="numeric"
                autoComplete="off"
                placeholder="80 可省略"
                value={config.port}
                onChange={(e) => setConfig({ port: e.target.value.replace(/[^\d]/g, "").slice(0, 5) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="access-domain">域名</Label>
              <Input
                id="access-domain"
                autoComplete="off"
                placeholder="例如 api.yourdomain.com"
                value={config.domain}
                onChange={(e) => setConfig({ domain: e.target.value })}
                onBlur={(e) => commitDomain(e.target.value)}
              />
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <EndpointCard
          label="HTTP · IP"
          hint="无证书也能调。适合脚本、内网和未备案机器。"
          value={urls.ip}
          placeholder={placeholderBase("ip")}
        />
        <EndpointCard
          label="HTTP · 域名"
          hint="和 IP 指向同一套 /v1 接口，可同时对外。"
          value={urls.domain}
          placeholder={placeholderBase("domain")}
        />
      </div>
    </div>
  );
}

function EndpointCard({
  label,
  hint,
  value,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
}) {
  const shown = value || placeholder;
  return (
    <Card className="p-5">
      <p className="text-xs tracking-wide text-faint uppercase">{label}</p>
      <p className={cn("mt-2 break-all font-mono text-sm", value ? "text-fg" : "text-muted")}>{shown}</p>
      <p className="mt-2 text-xs text-muted">{hint}</p>
      <div className="mt-3">
        <CopyButton value={shown} />
      </div>
    </Card>
  );
}

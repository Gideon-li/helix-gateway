import { getSql } from "@/lib/db";
import { iso } from "@/lib/utils";
import { DEFAULT_UPSTREAM } from "./defaults";
import { generateApiKey, hintFromSecret, keyPreview, newId, sha256Hex } from "./crypto";

export type ProviderRow = {
  id: string;
  name: string;
  baseUrl: string;
  keyHint: string;
  enabled: boolean;
  createdAt: string;
};

export type ModelRow = {
  id: string;
  providerId: string;
  publicName: string;
  upstreamName: string;
  enabled: boolean;
};

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  last4: string;
  status: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export type UsageRow = {
  id: string;
  model: string;
  status: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  error: string | null;
  createdAt: string;
  keyName: string | null;
};

type ProviderDb = {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  key_hint: string;
  enabled: boolean;
  created_at: unknown;
};

type ModelDb = {
  id: string;
  provider_id: string;
  public_name: string;
  upstream_name: string;
  enabled: boolean;
};

type KeyDb = {
  id: string;
  name: string;
  key_prefix: string;
  key_last4: string;
  status: string;
  last_used_at: unknown;
  created_at: unknown;
};

function asBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function asInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function seedWorkspace(userId: string): Promise<{ starterKey: string | null }> {
  const sql = await getSql();
  const existing = await sql<{ n: number }>`select count(*)::int as n from providers where user_id = ${userId}`;
  if (asInt(existing[0]?.n) > 0) return { starterKey: null };

  const providerId = newId();
  const hint = hintFromSecret(DEFAULT_UPSTREAM.apiKey);
  await sql`
    insert into providers (id, user_id, name, base_url, api_key, key_hint, enabled)
    values (${providerId}, ${userId}, ${DEFAULT_UPSTREAM.name}, ${DEFAULT_UPSTREAM.baseUrl}, ${DEFAULT_UPSTREAM.apiKey}, ${hint}, true)
  `;
  for (const model of DEFAULT_UPSTREAM.models) {
    await sql`
      insert into models (id, user_id, provider_id, public_name, upstream_name, enabled)
      values (${newId()}, ${userId}, ${providerId}, ${model.publicName}, ${model.upstreamName}, true)
    `;
  }

  const keys = await sql<{ n: number }>`select count(*)::int as n from api_keys where user_id = ${userId}`;
  if (asInt(keys[0]?.n) > 0) return { starterKey: null };

  const plaintext = generateApiKey();
  const preview = keyPreview(plaintext);
  await sql`
    insert into api_keys (id, user_id, name, key_hash, key_prefix, key_last4, status)
    values (${newId()}, ${userId}, ${"默认密钥"}, ${sha256Hex(plaintext)}, ${preview.prefix}, ${preview.last4}, ${"active"})
  `;
  return { starterKey: plaintext };
}

export async function listProviders(userId: string): Promise<ProviderRow[]> {
  const sql = await getSql();
  const rows = await sql<ProviderDb>`
    select id, name, base_url, api_key, key_hint, enabled, created_at
    from providers where user_id = ${userId} order by created_at asc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    keyHint: r.key_hint,
    enabled: asBool(r.enabled),
    createdAt: iso(r.created_at) ?? "",
  }));
}

export async function getProviderSecret(userId: string, providerId: string): Promise<{
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
} | null> {
  const sql = await getSql();
  const rows = await sql<ProviderDb>`
    select id, name, base_url, api_key, key_hint, enabled, created_at
    from providers where id = ${providerId} and user_id = ${userId} limit 1
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    apiKey: r.api_key,
    enabled: asBool(r.enabled),
  };
}

export async function upsertProvider(
  userId: string,
  input: { id?: string; name: string; baseUrl: string; apiKey?: string; enabled?: boolean },
): Promise<string> {
  const sql = await getSql();
  const name = input.name.trim();
  const baseUrl = input.baseUrl.trim().replace(/\/+$/, "");
  if (!name || !baseUrl) throw new Error("名称和 Base URL 不能为空");

  if (input.id) {
    const current = await getProviderSecret(userId, input.id);
    if (!current) throw new Error("上游不存在");
    const apiKey = input.apiKey?.trim() ? input.apiKey.trim() : current.apiKey;
    const hint = hintFromSecret(apiKey);
    const enabled = input.enabled ?? current.enabled;
    await sql`
      update providers
      set name = ${name}, base_url = ${baseUrl}, api_key = ${apiKey}, key_hint = ${hint}, enabled = ${enabled}
      where id = ${input.id} and user_id = ${userId}
    `;
    return input.id;
  }

  const apiKey = input.apiKey?.trim() ?? "";
  if (!apiKey) throw new Error("请填写上游 API Key");
  const id = newId();
  await sql`
    insert into providers (id, user_id, name, base_url, api_key, key_hint, enabled)
    values (${id}, ${userId}, ${name}, ${baseUrl}, ${apiKey}, ${hintFromSecret(apiKey)}, ${input.enabled ?? true})
  `;
  return id;
}

export async function deleteProvider(userId: string, id: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from models where provider_id = ${id} and user_id = ${userId}`;
  await sql`delete from providers where id = ${id} and user_id = ${userId}`;
}

export async function listModels(userId: string): Promise<ModelRow[]> {
  const sql = await getSql();
  const rows = await sql<ModelDb>`
    select id, provider_id, public_name, upstream_name, enabled
    from models where user_id = ${userId} order by public_name asc
  `;
  return rows.map((r) => ({
    id: r.id,
    providerId: r.provider_id,
    publicName: r.public_name,
    upstreamName: r.upstream_name,
    enabled: asBool(r.enabled),
  }));
}

export async function upsertModel(
  userId: string,
  input: { id?: string; providerId: string; publicName: string; upstreamName: string },
): Promise<void> {
  const sql = await getSql();
  const publicName = input.publicName.trim();
  const upstreamName = input.upstreamName.trim();
  if (!publicName || !upstreamName) throw new Error("模型名不能为空");
  const provider = await getProviderSecret(userId, input.providerId);
  if (!provider) throw new Error("请选择上游");
  if (input.id) {
    await sql`
      update models
      set provider_id = ${input.providerId}, public_name = ${publicName}, upstream_name = ${upstreamName}
      where id = ${input.id} and user_id = ${userId}
    `;
    return;
  }
  await sql`
    insert into models (id, user_id, provider_id, public_name, upstream_name, enabled)
    values (${newId()}, ${userId}, ${input.providerId}, ${publicName}, ${upstreamName}, true)
  `;
}

export async function deleteModel(userId: string, id: string): Promise<void> {
  const sql = await getSql();
  await sql`delete from models where id = ${id} and user_id = ${userId}`;
}

export async function listKeys(userId: string): Promise<ApiKeyRow[]> {
  const sql = await getSql();
  const rows = await sql<KeyDb>`
    select id, name, key_prefix, key_last4, status, last_used_at, created_at
    from api_keys where user_id = ${userId} order by created_at desc
  `;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.key_prefix,
    last4: r.key_last4,
    status: r.status,
    lastUsedAt: iso(r.last_used_at),
    createdAt: iso(r.created_at) ?? "",
  }));
}

export async function createKey(userId: string, name: string): Promise<{ row: ApiKeyRow; plaintext: string }> {
  const sql = await getSql();
  const label = name.trim() || "未命名密钥";
  const plaintext = generateApiKey();
  const preview = keyPreview(plaintext);
  const id = newId();
  await sql`
    insert into api_keys (id, user_id, name, key_hash, key_prefix, key_last4, status)
    values (${id}, ${userId}, ${label}, ${sha256Hex(plaintext)}, ${preview.prefix}, ${preview.last4}, ${"active"})
  `;
  return {
    plaintext,
    row: {
      id,
      name: label,
      prefix: preview.prefix,
      last4: preview.last4,
      status: "active",
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
    },
  };
}

export async function revokeKey(userId: string, id: string): Promise<void> {
  const sql = await getSql();
  await sql`update api_keys set status = ${"revoked"} where id = ${id} and user_id = ${userId}`;
}

export async function findKeyByHash(hash: string): Promise<{
  id: string;
  userId: string;
  status: string;
} | null> {
  const sql = await getSql();
  const rows = await sql<{ id: string; user_id: string; status: string }>`
    select id, user_id, status from api_keys where key_hash = ${hash} limit 1
  `;
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, userId: r.user_id, status: r.status };
}

export async function touchKey(id: string): Promise<void> {
  const sql = await getSql();
  await sql`update api_keys set last_used_at = now() where id = ${id}`;
}

export async function resolveRoute(userId: string, requestedModel: string): Promise<{
  providerId: string;
  baseUrl: string;
  apiKey: string;
  upstreamName: string;
  publicName: string;
} | null> {
  const sql = await getSql();
  const wanted = requestedModel.trim() || "qwen3.8-flash";
  const mapped = await sql<{
    provider_id: string;
    base_url: string;
    api_key: string;
    upstream_name: string;
    public_name: string;
    provider_enabled: boolean;
    model_enabled: boolean;
  }>`
    select p.id as provider_id, p.base_url, p.api_key, m.upstream_name, m.public_name,
           p.enabled as provider_enabled, m.enabled as model_enabled
    from models m
    join providers p on p.id = m.provider_id
    where m.user_id = ${userId} and m.public_name = ${wanted}
    limit 1
  `;
  const hit = mapped[0];
  if (hit && asBool(hit.provider_enabled) && asBool(hit.model_enabled)) {
    return {
      providerId: hit.provider_id,
      baseUrl: hit.base_url,
      apiKey: hit.api_key,
      upstreamName: hit.upstream_name,
      publicName: hit.public_name,
    };
  }

  const fallback = await sql<ProviderDb>`
    select id, name, base_url, api_key, key_hint, enabled, created_at
    from providers where user_id = ${userId} and enabled = true
    order by created_at asc limit 1
  `;
  const p = fallback[0];
  if (!p) return null;
  return {
    providerId: p.id,
    baseUrl: p.base_url,
    apiKey: p.api_key,
    upstreamName: wanted,
    publicName: wanted,
  };
}

export async function logUsage(input: {
  userId: string;
  apiKeyId: string | null;
  model: string;
  status: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  error?: string | null;
}): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into usage_logs (id, user_id, api_key_id, model, status, prompt_tokens, completion_tokens, latency_ms, error)
    values (${newId()}, ${input.userId}, ${input.apiKeyId}, ${input.model}, ${input.status}, ${input.promptTokens}, ${input.completionTokens}, ${input.latencyMs}, ${input.error ?? null})
  `;
}

export async function usageStats(userId: string): Promise<{
  requests24h: number;
  tokens24h: number;
  errors24h: number;
  activeKeys: number;
  series: { day: string; requests: number; tokens: number }[];
}> {
  const sql = await getSql();
  const day = await sql<{ requests: number; tokens: number; errors: number }>`
    select count(*)::int as requests,
           coalesce(sum(prompt_tokens + completion_tokens), 0)::int as tokens,
           coalesce(sum(case when status >= 400 then 1 else 0 end), 0)::int as errors
    from usage_logs
    where user_id = ${userId} and created_at > now() - interval '24 hours'
  `;
  const keys = await sql<{ n: number }>`
    select count(*)::int as n from api_keys where user_id = ${userId} and status = ${"active"}
  `;
  const series = await sql<{ day: string; requests: number; tokens: number }>`
    select created_at::date::text as day,
           count(*)::int as requests,
           coalesce(sum(prompt_tokens + completion_tokens), 0)::int as tokens
    from usage_logs
    where user_id = ${userId} and created_at > now() - interval '7 days'
    group by created_at::date
    order by day asc
  `;
  return {
    requests24h: asInt(day[0]?.requests),
    tokens24h: asInt(day[0]?.tokens),
    errors24h: asInt(day[0]?.errors),
    activeKeys: asInt(keys[0]?.n),
    series: series.map((r) => ({
      day: String(r.day),
      requests: asInt(r.requests),
      tokens: asInt(r.tokens),
    })),
  };
}

export async function listLogs(userId: string, limit = 80): Promise<UsageRow[]> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    model: string;
    status: number;
    prompt_tokens: number;
    completion_tokens: number;
    latency_ms: number;
    error: string | null;
    created_at: unknown;
    key_name: string | null;
  }>`
    select l.id, l.model, l.status, l.prompt_tokens, l.completion_tokens, l.latency_ms, l.error, l.created_at,
           k.name as key_name
    from usage_logs l
    left join api_keys k on k.id = l.api_key_id
    where l.user_id = ${userId}
    order by l.created_at desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    model: r.model,
    status: asInt(r.status),
    promptTokens: asInt(r.prompt_tokens),
    completionTokens: asInt(r.completion_tokens),
    latencyMs: asInt(r.latency_ms),
    error: r.error,
    createdAt: iso(r.created_at) ?? "",
    keyName: r.key_name,
  }));
}

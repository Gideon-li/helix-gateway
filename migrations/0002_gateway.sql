-- Helix gateway schema
create table if not exists providers (
  id text primary key,
  user_id text not null,
  name text not null,
  base_url text not null,
  api_key text not null,
  key_hint text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists models (
  id text primary key,
  user_id text not null,
  provider_id text not null,
  public_name text not null,
  upstream_name text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists api_keys (
  id text primary key,
  user_id text not null,
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  key_last4 text not null,
  status text not null default 'active',
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists usage_logs (
  id text primary key,
  user_id text not null,
  api_key_id text,
  model text not null default '',
  status integer not null default 0,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  latency_ms integer not null default 0,
  error text,
  created_at timestamptz not null default now()
);

-- Helix gateway schema: upstream providers, model aliases, API keys, usage.

create table if not exists providers (
  id            text primary key,
  user_id       text not null,
  name          text not null,
  base_url      text not null,
  api_key       text not null,
  key_hint      text not null default '',
  enabled       boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists providers_user_id_idx on providers (user_id);

create table if not exists models (
  id              text primary key,
  user_id         text not null,
  provider_id     text not null,
  public_name     text not null,
  upstream_name   text not null,
  enabled         boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists models_user_id_idx on models (user_id);
create unique index if not exists models_user_public_name_idx on models (user_id, public_name);

create table if not exists api_keys (
  id            text primary key,
  user_id       text not null,
  name          text not null,
  key_hash      text not null unique,
  key_prefix    text not null,
  key_last4     text not null,
  status        text not null default 'active',
  last_used_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists api_keys_user_id_idx on api_keys (user_id);
create index if not exists api_keys_hash_idx on api_keys (key_hash);

create table if not exists usage_logs (
  id                  text primary key,
  user_id             text not null,
  api_key_id          text,
  model               text not null default '',
  status              integer not null default 0,
  prompt_tokens       integer not null default 0,
  completion_tokens   integer not null default 0,
  latency_ms          integer not null default 0,
  error               text,
  created_at          timestamptz not null default now()
);
create index if not exists usage_logs_user_id_idx on usage_logs (user_id, created_at desc);

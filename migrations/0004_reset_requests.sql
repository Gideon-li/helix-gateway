-- Password-reset requests. Admins confirm by replying 「密码」; members need admin approval.

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
);
create unique index if not exists helix_reset_requests_reply_code_idx on helix_reset_requests (reply_code);
create unique index if not exists helix_reset_requests_approve_token_idx on helix_reset_requests (approve_token);
create index if not exists helix_reset_requests_user_idx on helix_reset_requests (user_id, status, requested_at desc);

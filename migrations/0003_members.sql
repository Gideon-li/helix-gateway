-- Helix console members and roles. Superadmin creates everyone else.

create table if not exists helix_members (
  user_id     text primary key,
  email       text not null unique,
  name        text not null default '',
  role        text not null,
  status      text not null default 'active',
  created_at  timestamptz not null default now(),
  created_by  text
);
create unique index if not exists helix_members_email_idx on helix_members (lower(email));
create index if not exists helix_members_role_idx on helix_members (role);

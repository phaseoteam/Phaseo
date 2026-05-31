-- OAuth CLI + PKCE beta foundation.
-- Adds API-owned OAuth storage while preserving the existing OAuth app metadata UI.

alter table if exists public.oauth_app_metadata
  add column if not exists client_type text not null default 'public'
    check (client_type in ('public', 'confidential')),
  add column if not exists client_secret_hash text,
  add column if not exists allowed_scopes text[] not null default '{}'::text[],
  add column if not exists is_first_party boolean not null default false,
  add column if not exists beta_status text not null default 'beta'
    check (beta_status in ('private', 'beta', 'public'));

create table if not exists public.oauth_clients (
  id text primary key,
  name text not null,
  description text,
  logo_url text,
  homepage_url text,
  client_type text not null default 'public'
    check (client_type in ('public', 'confidential')),
  client_secret_hash text,
  redirect_uris text[] not null default '{}'::text[],
  allowed_scopes text[] not null default '{}'::text[],
  is_first_party boolean not null default false,
  beta_status text not null default 'private'
    check (beta_status in ('private', 'beta', 'public')),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

insert into public.oauth_clients (
  id,
  name,
  description,
  client_type,
  allowed_scopes,
  is_first_party,
  beta_status,
  status
) values (
  'aistats_cli',
  'AI Stats CLI',
  'Official first-party AI Stats command line interface.',
  'public',
  array[
    'openid',
    'profile',
    'email',
    'workspaces:read',
    'workspaces:write',
    'keys:read',
    'keys:write',
    'keys:delete',
    'models:read',
    'providers:read',
    'pricing:read',
    'usage:read',
    'analytics:read',
    'generations:read',
    'presets:read',
    'presets:write',
    'presets:delete',
    'settings:read',
    'settings:write',
    'guardrails:read',
    'guardrails:write',
    'guardrails:delete',
    'management_keys:read',
    'management_keys:write',
    'management_keys:delete'
  ],
  true,
  'private',
  'active'
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  client_type = excluded.client_type,
  allowed_scopes = excluded.allowed_scopes,
  is_first_party = excluded.is_first_party,
  beta_status = excluded.beta_status,
  status = excluded.status,
  updated_at = now();

create table if not exists public.oauth_device_codes (
  id uuid primary key default gen_random_uuid(),
  device_code_hash text not null unique,
  user_code_hash text not null unique,
  client_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  scopes text[] not null default '{}'::text[],
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'expired')),
  interval_seconds integer not null default 5,
  expires_at timestamptz not null,
  approved_at timestamptz,
  denied_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists oauth_device_codes_client_status_idx
  on public.oauth_device_codes(client_id, status, expires_at);
create index if not exists oauth_device_codes_user_idx
  on public.oauth_device_codes(user_id) where user_id is not null;

create table if not exists public.oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  client_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  redirect_uri text not null,
  scopes text[] not null default '{}'::text[],
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists oauth_authorization_codes_client_idx
  on public.oauth_authorization_codes(client_id, expires_at);
create index if not exists oauth_authorization_codes_user_idx
  on public.oauth_authorization_codes(user_id);

create table if not exists public.oauth_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id text not null,
  scopes text[] not null default '{}'::text[],
  expires_at timestamptz,
  revoked_at timestamptz,
  rotated_from uuid references public.oauth_refresh_tokens(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists oauth_refresh_tokens_user_client_idx
  on public.oauth_refresh_tokens(user_id, client_id) where revoked_at is null;
create index if not exists oauth_refresh_tokens_workspace_idx
  on public.oauth_refresh_tokens(workspace_id) where revoked_at is null;

grant select, insert, update on public.oauth_clients to service_role;
grant select, insert, update on public.oauth_device_codes to service_role;
grant select, insert, update on public.oauth_authorization_codes to service_role;
grant select, insert, update on public.oauth_refresh_tokens to service_role;

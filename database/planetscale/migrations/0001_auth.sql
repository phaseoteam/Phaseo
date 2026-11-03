-- 0001_auth.sql: Better Auth's tables in schema `auth` (database/planetscale/README.md, "Identity model").
--
-- Loads after 0000_platform.sql (schema `auth`, roles, extensions) and before 0002_baseline.sql, whose 79 foreign
-- keys reference auth.users(id).
--
-- Generated from apps/web/src/lib/auth/better-auth/auth.cli.ts with the Better Auth CLI (`auth@1.7.13 generate`,
-- better-auth 1.7.13), then adjusted by hand:
--   * defaults: timestamps default now(); booleans default false; legacy jsonb defaults '{}';
--   * auth.users.email: case-insensitive unique index on lower(email) plus a plain index for Better Auth's
--     `email = $1` lookups (Better Auth lowercases emails before it writes or reads them);
--   * Phaseo columns: users.raw_user_meta_data, raw_app_meta_data, last_sign_in_at (from Supabase Auth),
--     users.mfa_reenrollment_required, sessions.aal;
--   * sessions.impersonated_by is a uuid foreign key (Better Auth declares it as text);
--   * accounts: one row per (provider_id, account_id);
--   * indexes on every foreign-key column, under Better Auth's own index names where it declares one (its
--     startup schema check compares declared index names and uniqueness).
-- Keep the table and column names in step with schema-map.ts. To regenerate, see MIGRATION-NOTES.md.

create schema if not exists auth;

-- user ------------------------------------------------------------------------------------------------------
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  email_verified boolean not null default false,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- twoFactor plugin
  two_factor_enabled boolean default false,
  -- admin plugin
  role text,
  banned boolean default false,
  ban_reason text,
  ban_expires timestamptz,
  -- carried over from Supabase Auth
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  last_sign_in_at timestamptz,
  -- Supabase Auth columns read by public.enqueue_feedback_request_emails and public.queue_slack_agent_refusal_email
  -- (plpgsql, so a missing column would only fail at runtime). Better Auth never writes them: deleted users are
  -- removed outright, and there are no anonymous users.
  deleted_at timestamptz,
  is_anonymous boolean not null default false,
  -- set by the Supabase import for users whose TOTP factor couldn't be carried over; cleared when they enrol again
  mfa_reenrollment_required boolean not null default false
);

create unique index users_email_lower_key on auth.users (lower(email));
create index users_email_idx on auth.users (email);
create index users_mfa_reenrollment_required_idx on auth.users (id) where mfa_reenrollment_required;

comment on table auth.users is 'Better Auth user model. Supabase Auth user ids are preserved on import.';
comment on column auth.users.mfa_reenrollment_required is 'Had a verified Supabase TOTP factor; must enrol again before MFA-gated access.';

-- session ---------------------------------------------------------------------------------------------------
create table auth.sessions (
  id uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- admin plugin
  impersonated_by uuid references auth.users (id) on delete set null,
  -- Supabase's authenticator assurance level for this session (apps/web/src/lib/auth/better-auth/aal.ts)
  aal text not null default 'aal1' check (aal in ('aal1', 'aal2'))
);

create index sessions_user_id_idx on auth.sessions (user_id);
create index sessions_impersonated_by_idx on auth.sessions (impersonated_by) where impersonated_by is not null;
create index sessions_expires_at_idx on auth.sessions (expires_at);

-- account ---------------------------------------------------------------------------------------------------
create table auth.accounts (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  provider_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  -- bcrypt ($2a$) for passwords imported from Supabase, Better Auth's scrypt for new ones
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_provider_account_key unique (provider_id, account_id)
);

create index accounts_user_id_idx on auth.accounts (user_id);

-- verification ----------------------------------------------------------------------------------------------
create table auth.verifications (
  id uuid primary key default gen_random_uuid(),
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index verifications_identifier_idx on auth.verifications (identifier);
create index verifications_expires_at_idx on auth.verifications (expires_at);

-- jwks (jwt plugin) -----------------------------------------------------------------------------------------
create table auth.jwks (
  id uuid primary key default gen_random_uuid(),
  public_key text not null,
  -- encrypted with BETTER_AUTH_SECRET by Better Auth
  private_key text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  alg text,
  crv text
);

-- twoFactor (twoFactor plugin) ------------------------------------------------------------------------------
create table auth.two_factors (
  id uuid primary key default gen_random_uuid(),
  secret text not null,
  backup_codes text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  verified boolean default true,
  failed_verification_count integer default 0,
  locked_until timestamptz
);

create index two_factors_secret_idx on auth.two_factors (secret);
create index two_factors_user_id_idx on auth.two_factors (user_id);

-- passkey (@better-auth/passkey) ----------------------------------------------------------------------------
create table auth.passkeys (
  id uuid primary key default gen_random_uuid(),
  name text,
  public_key text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  credential_id text not null,
  counter integer not null,
  device_type text not null,
  backed_up boolean not null,
  transports text,
  created_at timestamptz default now(),
  aaguid text
);

create index passkeys_user_id_idx on auth.passkeys (user_id);
create index passkeys_credential_id_idx on auth.passkeys (credential_id);

-- ssoProvider (@better-auth/sso) ----------------------------------------------------------------------------
create table auth.sso_providers (
  id uuid primary key default gen_random_uuid(),
  issuer text not null,
  oidc_config text,
  saml_config text,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_id text not null unique,
  organization_id text,
  domain text not null
);

create index sso_providers_user_id_idx on auth.sso_providers (user_id);
create index sso_providers_domain_idx on auth.sso_providers (lower(domain));

-- rateLimit (rateLimit.storage = "database") ----------------------------------------------------------------
create table auth.rate_limits (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  count integer not null,
  last_request bigint not null
);

-- Privileges ------------------------------------------------------------------------------------------------
-- Better Auth connects as the application role that owns these tables. Request-scoped roles (anon,
-- authenticated; the compat client's SET LOCAL ROLE) must never read sessions, tokens, hashes or TOTP secrets.
-- service_role keeps what Supabase gave it (supabase/tests grant select, references on auth.users).
revoke all on all tables in schema auth from public;

do $privileges$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema auth from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema auth from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema auth to service_role';
    execute 'grant select, references on auth.users to service_role';
  end if;
end
$privileges$;

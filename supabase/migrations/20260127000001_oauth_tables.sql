-- =========================
-- OAuth 2.1 Integration Schema
-- =========================
-- This migration adds support for OAuth 2.1 authorization server integration
-- with Supabase's native OAuth capabilities. It enables third-party developers
-- to build integrations with "Sign in with AI Stats" and access the API gateway
-- on behalf of users.
--
-- Architecture:
-- - Supabase OAuth server manages client credentials and token issuance
-- - oauth_app_metadata stores rich metadata for developer dashboard UI
-- - oauth_authorizations tracks user consent and enables revocation
-- - gateway_requests extended to audit OAuth-authenticated requests
--
-- Security:
-- - Team-based RLS policies using existing is_team_member() function
-- - User-scoped RLS for authorization management
-- - JWT validation enforced at API gateway layer
-- =========================

-- =========================
-- Table: oauth_app_metadata
-- =========================
-- Stores rich metadata for OAuth apps registered by developers.
-- Complements Supabase's internal OAuth client storage (which is opaque).
-- One-to-one relationship: client_id references Supabase OAuth client.

create table if not exists public.oauth_app_metadata (
  -- Primary key
  id uuid primary key default gen_random_uuid(),

  -- OAuth client reference (Supabase-managed)
  client_id text not null unique,

  -- Team ownership (developer team that created this OAuth app)
  team_id uuid not null references public.teams(id) on delete cascade,

  -- App identity & branding
  name text not null,
  description text,
  homepage_url text,
  logo_url text,
  privacy_policy_url text,
  terms_of_service_url text,

  -- Audit metadata
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  -- Lifecycle status
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),

  -- Indexes will be created below
  constraint oauth_app_metadata_name_check check (char_length(name) >= 3 and char_length(name) <= 100)
);
-- Indexes for oauth_app_metadata
create index if not exists oauth_app_metadata_team_id_idx on public.oauth_app_metadata(team_id);
create index if not exists oauth_app_metadata_created_by_idx on public.oauth_app_metadata(created_by);
create index if not exists oauth_app_metadata_status_idx on public.oauth_app_metadata(status) where status = 'active';
-- Trigger to update updated_at timestamp
create or replace function public.update_oauth_app_metadata_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger update_oauth_app_metadata_updated_at_trigger
  before update on public.oauth_app_metadata
  for each row
  execute function public.update_oauth_app_metadata_updated_at();
-- =========================
-- Table: oauth_authorizations
-- =========================
-- Tracks user authorizations to third-party OAuth apps.
-- Each row represents a user granting an OAuth app access to their account.
-- Used for:
-- 1. Displaying authorized apps in user settings
-- 2. Validating that authorization hasn't been revoked during token validation
-- 3. Tracking usage statistics per OAuth client
-- 4. Enabling user-initiated revocation

create table if not exists public.oauth_authorizations (
  -- Primary key
  id uuid primary key default gen_random_uuid(),

  -- Authorization participants
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null, -- References oauth_app_metadata(client_id) and Supabase OAuth client
  team_id uuid not null references public.teams(id) on delete cascade, -- Which team's resources this authorization can access

  -- OAuth metadata
  scopes text[] not null default '{}', -- Granted scopes (e.g., ['openid', 'email', 'gateway:access'])

  -- Audit trail
  created_at timestamp with time zone not null default now(),
  last_used_at timestamp with time zone, -- Updated when OAuth token is used
  revoked_at timestamp with time zone, -- null = active, non-null = revoked

  -- Unique constraint: one authorization per user+client+team combination
  constraint oauth_authorizations_user_client_team_unique unique(user_id, client_id, team_id)
);
-- Indexes for oauth_authorizations
create index if not exists oauth_authorizations_user_id_idx on public.oauth_authorizations(user_id) where revoked_at is null;
create index if not exists oauth_authorizations_client_id_idx on public.oauth_authorizations(client_id) where revoked_at is null;
create index if not exists oauth_authorizations_team_id_idx on public.oauth_authorizations(team_id) where revoked_at is null;
create index if not exists oauth_authorizations_last_used_idx on public.oauth_authorizations(last_used_at desc) where revoked_at is null;
-- Composite index for fast token validation lookup
create index if not exists oauth_authorizations_validation_idx
  on public.oauth_authorizations(user_id, client_id, team_id)
  where revoked_at is null;
-- =========================
-- Extend: gateway_requests
-- =========================
-- Add OAuth-specific columns to track authentication method and OAuth metadata

alter table public.gateway_requests
  add column if not exists auth_method text default 'api_key' check (auth_method in ('api_key', 'oauth')),
  add column if not exists oauth_client_id text,
  add column if not exists oauth_user_id uuid;
-- Indexes for OAuth audit queries
create index if not exists gateway_requests_auth_method_idx on public.gateway_requests(auth_method) where auth_method = 'oauth';
create index if not exists gateway_requests_oauth_client_idx on public.gateway_requests(oauth_client_id) where oauth_client_id is not null;
create index if not exists gateway_requests_oauth_user_idx on public.gateway_requests(oauth_user_id) where oauth_user_id is not null;
-- =========================
-- RLS: oauth_app_metadata
-- =========================
-- Team members can fully manage OAuth apps for their team

alter table public.oauth_app_metadata enable row level security;
-- SELECT: Team members can view their team's OAuth apps
drop policy if exists oauth_app_metadata_select_own_team on public.oauth_app_metadata;
create policy oauth_app_metadata_select_own_team
  on public.oauth_app_metadata
  for select
  to authenticated
  using (public.is_team_member(team_id));
-- INSERT: Team members can create OAuth apps for their team
drop policy if exists oauth_app_metadata_insert_own_team on public.oauth_app_metadata;
create policy oauth_app_metadata_insert_own_team
  on public.oauth_app_metadata
  for insert
  to authenticated
  with check (
    public.is_team_member(team_id)
    and created_by = auth.uid()
  );
-- UPDATE: Team members can update their team's OAuth apps
drop policy if exists oauth_app_metadata_update_own_team on public.oauth_app_metadata;
create policy oauth_app_metadata_update_own_team
  on public.oauth_app_metadata
  for update
  to authenticated
  using (public.is_team_member(team_id))
  with check (public.is_team_member(team_id));
-- DELETE: Team members can delete their team's OAuth apps (soft delete via status)
drop policy if exists oauth_app_metadata_delete_own_team on public.oauth_app_metadata;
create policy oauth_app_metadata_delete_own_team
  on public.oauth_app_metadata
  for delete
  to authenticated
  using (public.is_team_member(team_id));
-- =========================
-- RLS: oauth_authorizations
-- =========================
-- Users can view and revoke their own authorizations
-- Team members can view authorizations for their team's OAuth apps (analytics)

alter table public.oauth_authorizations enable row level security;
-- SELECT: Users can view their own authorizations
drop policy if exists oauth_authorizations_select_own on public.oauth_authorizations;
create policy oauth_authorizations_select_own
  on public.oauth_authorizations
  for select
  to authenticated
  using (user_id = auth.uid());
-- SELECT: Team members can view authorizations for their team's OAuth apps (for analytics)
drop policy if exists oauth_authorizations_select_team_apps on public.oauth_authorizations;
create policy oauth_authorizations_select_team_apps
  on public.oauth_authorizations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.oauth_app_metadata oam
      where oam.client_id = oauth_authorizations.client_id
        and public.is_team_member(oam.team_id)
    )
  );
-- INSERT: System only (authorizations created via OAuth flow, not directly)
-- No insert policy - authorizations are created server-side during OAuth consent

-- UPDATE: Users can update their own authorizations (for revocation, last_used_at)
drop policy if exists oauth_authorizations_update_own on public.oauth_authorizations;
create policy oauth_authorizations_update_own
  on public.oauth_authorizations
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- DELETE: Users can delete their own authorizations (hard delete)
drop policy if exists oauth_authorizations_delete_own on public.oauth_authorizations;
create policy oauth_authorizations_delete_own
  on public.oauth_authorizations
  for delete
  to authenticated
  using (user_id = auth.uid());
-- =========================
-- Views: OAuth Analytics
-- =========================

-- View: Active OAuth apps with authorization counts
create or replace view public.oauth_apps_with_stats as
select
  oam.*,
  count(oa.id) filter (where oa.revoked_at is null) as active_authorizations,
  count(oa.id) as total_authorizations,
  max(oa.last_used_at) as last_used_at,
  count(distinct gr.id) filter (where gr.created_at > now() - interval '30 days') as requests_last_30d
from public.oauth_app_metadata oam
left join public.oauth_authorizations oa on oa.client_id = oam.client_id
left join public.gateway_requests gr on gr.oauth_client_id = oam.client_id
where oam.status = 'active'
group by oam.id;
-- Grant access to authenticated users (RLS will filter by team)
grant select on public.oauth_apps_with_stats to authenticated;
-- View: User's authorized apps with last usage
create or replace view public.user_authorized_apps as
select
  oa.id as authorization_id,
  oa.user_id,
  oa.client_id,
  oa.team_id,
  oa.scopes,
  oa.created_at as authorized_at,
  oa.last_used_at,
  oam.name as app_name,
  oam.description as app_description,
  oam.logo_url as app_logo_url,
  oam.homepage_url as app_homepage_url,
  t.name as team_name
from public.oauth_authorizations oa
join public.oauth_app_metadata oam on oam.client_id = oa.client_id
join public.teams t on t.id = oa.team_id
where oa.revoked_at is null
  and oam.status = 'active'
order by oa.last_used_at desc nulls last;
-- Grant access to authenticated users (RLS will filter by user_id)
grant select on public.user_authorized_apps to authenticated;
-- =========================
-- Comments
-- =========================

comment on table public.oauth_app_metadata is 'OAuth application metadata for third-party developer integrations. Complements Supabase OAuth client credentials.';
comment on table public.oauth_authorizations is 'User authorizations to OAuth applications. Tracks consent, usage, and revocation.';
comment on column public.gateway_requests.auth_method is 'Authentication method used for the request: api_key (legacy HMAC keys) or oauth (JWT tokens)';
comment on column public.gateway_requests.oauth_client_id is 'OAuth client ID if auth_method is oauth';
comment on column public.gateway_requests.oauth_user_id is 'User ID who authorized the OAuth app (from JWT claims)';
comment on view public.oauth_apps_with_stats is 'OAuth apps with authorization and usage statistics';
comment on view public.user_authorized_apps is 'Active OAuth authorizations for the current user with app details';

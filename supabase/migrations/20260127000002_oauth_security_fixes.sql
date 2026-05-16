-- =========================
-- OAuth Security Fixes
-- =========================
-- This migration fixes security issues with OAuth views:
-- 1. Makes views explicitly SECURITY INVOKER (respect RLS)
-- 2. Adds missing RLS policies to underlying tables
-- =========================

-- =========================
-- Fix: Make OAuth views SECURITY INVOKER
-- =========================
-- These views should respect RLS policies on underlying tables,
-- not bypass them with SECURITY DEFINER

-- Recreate oauth_apps_with_stats as SECURITY INVOKER
drop view if exists public.oauth_apps_with_stats;
create view public.oauth_apps_with_stats
with (security_invoker = true)
as
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
grant select on public.oauth_apps_with_stats to authenticated;
comment on view public.oauth_apps_with_stats is 'OAuth apps with authorization and usage statistics. SECURITY INVOKER - respects RLS policies on underlying tables.';
-- Recreate user_authorized_apps as SECURITY INVOKER
drop view if exists public.user_authorized_apps;
create view public.user_authorized_apps
with (security_invoker = true)
as
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
grant select on public.user_authorized_apps to authenticated;
comment on view public.user_authorized_apps is 'Active OAuth authorizations for the current user with app details. SECURITY INVOKER - respects RLS policies on underlying tables.';
-- =========================
-- Ensure RLS on teams table
-- =========================
-- The teams table must have RLS enabled for the views to be secure

alter table public.teams enable row level security;
-- Policy: Users can view teams they are members of
drop policy if exists teams_select_member on public.teams;
create policy teams_select_member
  on public.teams
  for select
  to authenticated
  using (public.is_team_member(id));
-- Policy: Users can update teams they are members of (for team settings)
drop policy if exists teams_update_member on public.teams;
create policy teams_update_member
  on public.teams
  for update
  to authenticated
  using (public.is_team_member(id))
  with check (public.is_team_member(id));
-- =========================
-- Ensure RLS on gateway_requests table
-- =========================
-- Gateway requests should only be viewable by team members

alter table public.gateway_requests enable row level security;
-- Policy: Team members can view their team's gateway requests
drop policy if exists gateway_requests_select_own_team on public.gateway_requests;
create policy gateway_requests_select_own_team
  on public.gateway_requests
  for select
  to authenticated
  using (public.is_team_member(team_id));
-- Policy: Service role can insert gateway requests (for audit logging from API)
drop policy if exists gateway_requests_insert_service on public.gateway_requests;
create policy gateway_requests_insert_service
  on public.gateway_requests
  for insert
  to service_role
  with check (true);
-- =========================
-- Grant service role bypass
-- =========================
-- The API gateway needs service_role access to:
-- 1. Insert audit logs to gateway_requests
-- 2. Check oauth_authorizations for revocation
-- 3. Update last_used_at in oauth_authorizations

-- Service role can bypass RLS for these operations
-- This is safe because the API gateway authenticates separately

grant usage on schema public to service_role;
grant select, insert, update on public.gateway_requests to service_role;
grant select, update on public.oauth_authorizations to service_role;
grant select on public.oauth_app_metadata to service_role;
grant select on public.teams to service_role;
-- =========================
-- Verification
-- =========================

comment on table public.teams is 'Teams (organizations) with RLS enabled. Users can only access teams they are members of.';
comment on table public.gateway_requests is 'API gateway audit logs with RLS enabled. Team members can view their team''s requests. Service role can insert for audit logging.';

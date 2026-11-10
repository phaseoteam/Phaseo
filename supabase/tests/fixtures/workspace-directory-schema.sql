-- Minimal directory and entitlement tables for the workspace directory tests (PGlite and the two-session
-- lock smoke test on a real PostgreSQL). Real function files are loaded on top. Foreign keys and columns
-- the tests don't need are left out; the foreign keys between the directory tables are the real ones.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create schema if not exists private;
create type public.workspace_role as enum ('owner', 'admin', 'member');
create table public.workspaces (id uuid primary key, owner_user_id uuid not null);
create table public.workspace_members (workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null, role public.workspace_role not null, last_accessed_at timestamptz, primary key (workspace_id, user_id));
create table public.workspace_departments (id uuid primary key, workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null, description text, icon text not null default 'users', color text not null default 'slate',
  source_type text not null default 'manual', source_id uuid, directory_name text, name_overridden boolean not null default false,
  updated_at timestamptz not null default now(), name_normalized text generated always as (lower(btrim(name))) stored,
  unique (id, workspace_id));
create table public.scim_users (id uuid primary key, workspace_id uuid not null, auth_user_id uuid, active boolean not null default true,
  department text, unique (id, workspace_id));
create table public.scim_groups (id uuid primary key default gen_random_uuid(), workspace_id uuid not null, external_id text, display_name text,
  version bigint not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (id, workspace_id), unique (workspace_id, external_id));
create table public.scim_group_members (workspace_id uuid not null, group_id uuid not null, user_id uuid not null,
  primary key (group_id, user_id),
  foreign key (group_id, workspace_id) references public.scim_groups (id, workspace_id) on delete cascade,
  foreign key (user_id, workspace_id) references public.scim_users (id, workspace_id) on delete cascade);
create table public.scim_group_mappings (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  scim_group_id uuid not null, department_id uuid not null, access_role text not null default 'member',
  department_position text not null default 'member',
  foreign key (scim_group_id, workspace_id) references public.scim_groups (id, workspace_id) on delete cascade,
  foreign key (department_id, workspace_id) references public.workspace_departments (id, workspace_id) on delete cascade);
create table public.workspace_access_grants (workspace_id uuid not null, user_id uuid not null, source_type text not null,
  source_id uuid not null, access_role text not null, primary key (workspace_id, user_id, source_type, source_id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.workspace_department_grants (workspace_id uuid not null, user_id uuid not null, department_id uuid not null,
  source_type text not null, source_id uuid not null, position text not null default 'member', is_primary boolean not null default false,
  updated_at timestamptz not null default now(), primary key (workspace_id, user_id, department_id, source_type, source_id),
  foreign key (department_id, workspace_id) references public.workspace_departments (id, workspace_id) on delete cascade,
  created_at timestamptz not null default now());
create table public.workspace_member_overrides (workspace_id uuid not null, user_id uuid not null, access_role text,
  department_override_enabled boolean not null default false, department_id uuid, department_position text, updated_by uuid,
  updated_at timestamptz not null default now(), primary key (workspace_id, user_id),
  foreign key (department_id, workspace_id) references public.workspace_departments (id, workspace_id) on delete restrict);
create table public.workspace_directory_audit_events (id uuid primary key default gen_random_uuid(), workspace_id uuid, actor_user_id uuid,
  action text, target_type text, target_id text, before_state jsonb, after_state jsonb, request_id text);
create table public.workspace_member_effective_entitlements (workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null, access_role text not null, department_id uuid, department_position text, access_source text not null,
  department_source text not null, computed_at timestamptz not null default now(), primary key (workspace_id, user_id),
  foreign key (department_id, workspace_id) references public.workspace_departments (id, workspace_id) on delete restrict);
create table public.workspace_member_entitlement_history (id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
  user_id uuid not null, access_role text not null, department_id uuid, department_name text, department_color text, department_icon text,
  department_position text, access_source text not null, department_source text not null, effective_from timestamptz not null default now(),
  effective_to timestamptz, changed_by uuid, change_reason text not null default 'reconcile', created_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from));
-- The real refresh (tests that check effective entitlements load it over this stub) takes the workspace lock first and then writes effective entitlements; only the lock
-- matters for these tests.
create function public.refresh_workspace_effective_entitlements(p_workspace_id uuid, p_changed_by uuid default null, p_reason text default 'reconcile')
  returns void language plpgsql as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_workspace_id::text)::bigint);
end $$;

-- Guardrails (Alpha): global privacy/provider restrictions + per-guardrail policies.
-- Notes:
-- - Defaults are permissive to preserve existing behavior until explicitly configured.
-- - "0" limits mean "unlimited", consistent with existing key limits.

-- -------------------------
-- workspace_settings: global policy toggles
-- -------------------------
alter table public.workspace_settings
  add column if not exists privacy_enable_paid_may_train boolean not null default true;
alter table public.workspace_settings
  add column if not exists privacy_enable_free_may_train boolean not null default true;
alter table public.workspace_settings
  add column if not exists privacy_enable_free_may_publish_prompts boolean not null default true;
alter table public.workspace_settings
  add column if not exists privacy_enable_input_output_logging boolean not null default true;
alter table public.workspace_settings
  add column if not exists privacy_zdr_only boolean not null default false;
alter table public.workspace_settings
  add column if not exists provider_restriction_mode text not null default 'none';
alter table public.workspace_settings
  add column if not exists provider_restriction_provider_ids text[] not null default '{}'::text[];
alter table public.workspace_settings
  add column if not exists provider_restriction_enforce_allowed boolean not null default false;
alter table public.workspace_settings
  drop constraint if exists workspace_settings_provider_restriction_mode_check;
alter table public.workspace_settings
  add constraint workspace_settings_provider_restriction_mode_check
  check (provider_restriction_mode in ('none', 'allowlist', 'blocklist'));
-- -------------------------
-- workspace_guardrails: per-guardrail policies
-- -------------------------
create table if not exists public.workspace_guardrails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  enabled boolean not null default true,
  name text not null,
  description text,

  -- Privacy toggles (further restrictions)
  privacy_enable_paid_may_train boolean not null default true,
  privacy_enable_free_may_train boolean not null default true,
  privacy_enable_free_may_publish_prompts boolean not null default true,
  privacy_enable_input_output_logging boolean not null default true,
  privacy_zdr_only boolean not null default false,

  -- Provider restrictions
  provider_restriction_mode text not null default 'none',
  provider_restriction_provider_ids text[] not null default '{}'::text[],
  provider_restriction_enforce_allowed boolean not null default false,

  -- Model restrictions (resolved `api_model_id` values after alias resolution)
  allowed_api_model_ids text[] not null default '{}'::text[],

  -- Budgets (0 = unlimited)
  daily_limit_requests bigint not null default 0,
  weekly_limit_requests bigint not null default 0,
  monthly_limit_requests bigint not null default 0,
  daily_limit_cost_nanos bigint not null default 0,
  weekly_limit_cost_nanos bigint not null default 0,
  monthly_limit_cost_nanos bigint not null default 0,

  created_at timestamptz not null default (now() at time zone 'utc'),
  updated_at timestamptz not null default (now() at time zone 'utc')
);
alter table public.workspace_guardrails
  drop constraint if exists workspace_guardrails_provider_restriction_mode_check;
alter table public.workspace_guardrails
  add constraint workspace_guardrails_provider_restriction_mode_check
  check (provider_restriction_mode in ('none', 'allowlist', 'blocklist'));
create index if not exists workspace_guardrails_workspace_id_idx
  on public.workspace_guardrails (workspace_id);
-- -------------------------
-- key_guardrails: apply guardrails to keys (many-to-many)
-- -------------------------
create table if not exists public.key_guardrails (
  key_id uuid not null references public.keys(id) on delete cascade,
  guardrail_id uuid not null references public.workspace_guardrails(id) on delete cascade,
  created_at timestamptz not null default (now() at time zone 'utc'),
  primary key (key_id, guardrail_id)
);
create index if not exists key_guardrails_guardrail_id_idx
  on public.key_guardrails (guardrail_id);
-- -------------------------
-- RLS: workspace_guardrails / key_guardrails
-- -------------------------
alter table public.workspace_guardrails enable row level security;
drop policy if exists workspace_guardrails_select_own_team on public.workspace_guardrails;
drop policy if exists workspace_guardrails_insert_own_team on public.workspace_guardrails;
drop policy if exists workspace_guardrails_update_own_team on public.workspace_guardrails;
drop policy if exists workspace_guardrails_delete_own_team on public.workspace_guardrails;
create policy workspace_guardrails_select_own_team
  on public.workspace_guardrails
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));
create policy workspace_guardrails_insert_own_team
  on public.workspace_guardrails
  for insert
  to authenticated
  with check (public.is_workspace_admin(workspace_id));
create policy workspace_guardrails_update_own_team
  on public.workspace_guardrails
  for update
  to authenticated
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));
create policy workspace_guardrails_delete_own_team
  on public.workspace_guardrails
  for delete
  to authenticated
  using (public.is_workspace_admin(workspace_id));
alter table public.key_guardrails enable row level security;
drop policy if exists key_guardrails_select_own_team on public.key_guardrails;
drop policy if exists key_guardrails_insert_own_team on public.key_guardrails;
drop policy if exists key_guardrails_update_own_team on public.key_guardrails;
drop policy if exists key_guardrails_delete_own_team on public.key_guardrails;
create policy key_guardrails_select_own_team
  on public.key_guardrails
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.keys k
      where k.id = key_guardrails.key_id
        and public.is_workspace_member(k.workspace_id)
    )
  );
create policy key_guardrails_insert_own_team
  on public.key_guardrails
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.keys k
      join public.workspace_guardrails g on g.id = key_guardrails.guardrail_id
      where k.id = key_guardrails.key_id
        and k.workspace_id = g.workspace_id
        and public.is_workspace_admin(k.workspace_id)
    )
  );
create policy key_guardrails_update_own_team
  on public.key_guardrails
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.keys k
      join public.workspace_guardrails g on g.id = key_guardrails.guardrail_id
      where k.id = key_guardrails.key_id
        and k.workspace_id = g.workspace_id
        and public.is_workspace_admin(k.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.keys k
      join public.workspace_guardrails g on g.id = key_guardrails.guardrail_id
      where k.id = key_guardrails.key_id
        and k.workspace_id = g.workspace_id
        and public.is_workspace_admin(k.workspace_id)
    )
  );
create policy key_guardrails_delete_own_team
  on public.key_guardrails
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.keys k
      join public.workspace_guardrails g on g.id = key_guardrails.guardrail_id
      where k.id = key_guardrails.key_id
        and k.workspace_id = g.workspace_id
        and public.is_workspace_admin(k.workspace_id)
    )
  );

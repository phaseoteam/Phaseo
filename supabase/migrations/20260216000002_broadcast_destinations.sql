-- Broadcast destinations (Pre-Release)
-- Stores destination config, key filters, and grouped rule filters.
-- Secrets are intended to be encrypted before storing in destination_config.

-- -------------------------
-- team_broadcast_destinations
-- -------------------------
create table if not exists public.team_broadcast_destinations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  enabled boolean not null default false,
  destination_id text not null,
  name text not null,
  destination_config jsonb not null default '{}'::jsonb,

  privacy_exclude_prompts_and_outputs boolean not null default false,
  sampling_rate numeric(6,5) not null default 1.0,
  group_join_operator text not null default 'or',

  created_at timestamptz not null default (now() at time zone 'utc'),
  updated_at timestamptz not null default (now() at time zone 'utc')
);

alter table public.team_broadcast_destinations
  drop constraint if exists team_broadcast_destinations_destination_id_check;

alter table public.team_broadcast_destinations
  add constraint team_broadcast_destinations_destination_id_check
  check (
    destination_id in (
      'arize',
      'braintrust',
      'clickhouse',
      'comet_opik',
      'datadog',
      'grafana_cloud',
      'langfuse',
      'langsmith',
      'new_relic',
      'otel_collector',
      'posthog',
      's3',
      'sentry',
      'snowflake',
      'wandb_weave',
      'webhook'
    )
  );

alter table public.team_broadcast_destinations
  drop constraint if exists team_broadcast_destinations_sampling_rate_check;

alter table public.team_broadcast_destinations
  add constraint team_broadcast_destinations_sampling_rate_check
  check (sampling_rate >= 0 and sampling_rate <= 1);

alter table public.team_broadcast_destinations
  drop constraint if exists team_broadcast_destinations_group_join_operator_check;

alter table public.team_broadcast_destinations
  add constraint team_broadcast_destinations_group_join_operator_check
  check (group_join_operator in ('and', 'or'));

create index if not exists team_broadcast_destinations_team_id_idx
  on public.team_broadcast_destinations (team_id);

create index if not exists team_broadcast_destinations_team_enabled_idx
  on public.team_broadcast_destinations (team_id, enabled);

-- -------------------------
-- broadcast_destination_keys
-- -------------------------
create table if not exists public.broadcast_destination_keys (
  destination_id uuid not null references public.team_broadcast_destinations(id) on delete cascade,
  key_id uuid not null references public.keys(id) on delete cascade,
  created_at timestamptz not null default (now() at time zone 'utc'),
  primary key (destination_id, key_id)
);

create index if not exists broadcast_destination_keys_key_id_idx
  on public.broadcast_destination_keys (key_id);

-- -------------------------
-- broadcast_destination_rule_groups
-- -------------------------
create table if not exists public.broadcast_destination_rule_groups (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.team_broadcast_destinations(id) on delete cascade,
  name text not null,
  match_operator text not null default 'and',
  position integer not null default 0,
  created_at timestamptz not null default (now() at time zone 'utc'),
  updated_at timestamptz not null default (now() at time zone 'utc')
);

alter table public.broadcast_destination_rule_groups
  drop constraint if exists broadcast_destination_rule_groups_match_operator_check;

alter table public.broadcast_destination_rule_groups
  add constraint broadcast_destination_rule_groups_match_operator_check
  check (match_operator in ('and', 'or'));

create index if not exists broadcast_destination_rule_groups_destination_id_idx
  on public.broadcast_destination_rule_groups (destination_id, position);

-- -------------------------
-- broadcast_destination_rules
-- -------------------------
create table if not exists public.broadcast_destination_rules (
  id uuid primary key default gen_random_uuid(),
  rule_group_id uuid not null references public.broadcast_destination_rule_groups(id) on delete cascade,
  field text not null,
  condition text not null,
  value text,
  position integer not null default 0,
  created_at timestamptz not null default (now() at time zone 'utc'),
  updated_at timestamptz not null default (now() at time zone 'utc')
);

alter table public.broadcast_destination_rules
  drop constraint if exists broadcast_destination_rules_field_check;

alter table public.broadcast_destination_rules
  add constraint broadcast_destination_rules_field_check
  check (
    field in (
      'model',
      'provider',
      'session_id',
      'user_id',
      'api_key_name',
      'finish_reason',
      'input',
      'output',
      'total_cost',
      'total_tokens',
      'prompt_tokens',
      'completion_tokens'
    )
  );

alter table public.broadcast_destination_rules
  drop constraint if exists broadcast_destination_rules_condition_check;

alter table public.broadcast_destination_rules
  add constraint broadcast_destination_rules_condition_check
  check (
    condition in (
      'equals',
      'not_equals',
      'contains',
      'not_contains',
      'starts_with',
      'ends_with',
      'exists',
      'not_exists',
      'matches_regex'
    )
  );

create index if not exists broadcast_destination_rules_group_id_idx
  on public.broadcast_destination_rules (rule_group_id, position);

-- -------------------------
-- RLS
-- -------------------------
alter table public.team_broadcast_destinations enable row level security;
drop policy if exists team_broadcast_destinations_select_own_team on public.team_broadcast_destinations;
drop policy if exists team_broadcast_destinations_insert_own_team on public.team_broadcast_destinations;
drop policy if exists team_broadcast_destinations_update_own_team on public.team_broadcast_destinations;
drop policy if exists team_broadcast_destinations_delete_own_team on public.team_broadcast_destinations;

create policy team_broadcast_destinations_select_own_team
  on public.team_broadcast_destinations
  for select
  to authenticated
  using (public.is_team_member(team_id));

create policy team_broadcast_destinations_insert_own_team
  on public.team_broadcast_destinations
  for insert
  to authenticated
  with check (public.is_team_admin(team_id));

create policy team_broadcast_destinations_update_own_team
  on public.team_broadcast_destinations
  for update
  to authenticated
  using (public.is_team_admin(team_id))
  with check (public.is_team_admin(team_id));

create policy team_broadcast_destinations_delete_own_team
  on public.team_broadcast_destinations
  for delete
  to authenticated
  using (public.is_team_admin(team_id));

alter table public.broadcast_destination_keys enable row level security;
drop policy if exists broadcast_destination_keys_select_own_team on public.broadcast_destination_keys;
drop policy if exists broadcast_destination_keys_insert_own_team on public.broadcast_destination_keys;
drop policy if exists broadcast_destination_keys_update_own_team on public.broadcast_destination_keys;
drop policy if exists broadcast_destination_keys_delete_own_team on public.broadcast_destination_keys;

create policy broadcast_destination_keys_select_own_team
  on public.broadcast_destination_keys
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team_broadcast_destinations d
      where d.id = broadcast_destination_keys.destination_id
        and public.is_team_member(d.team_id)
    )
  );

create policy broadcast_destination_keys_insert_own_team
  on public.broadcast_destination_keys
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.team_broadcast_destinations d
      join public.keys k on k.id = broadcast_destination_keys.key_id
      where d.id = broadcast_destination_keys.destination_id
        and d.team_id = k.team_id
        and public.is_team_admin(d.team_id)
    )
  );

create policy broadcast_destination_keys_update_own_team
  on public.broadcast_destination_keys
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.team_broadcast_destinations d
      where d.id = broadcast_destination_keys.destination_id
        and public.is_team_admin(d.team_id)
    )
  )
  with check (
    exists (
      select 1
      from public.team_broadcast_destinations d
      where d.id = broadcast_destination_keys.destination_id
        and public.is_team_admin(d.team_id)
    )
  );

create policy broadcast_destination_keys_delete_own_team
  on public.broadcast_destination_keys
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.team_broadcast_destinations d
      where d.id = broadcast_destination_keys.destination_id
        and public.is_team_admin(d.team_id)
    )
  );

alter table public.broadcast_destination_rule_groups enable row level security;
drop policy if exists broadcast_destination_rule_groups_select_own_team on public.broadcast_destination_rule_groups;
drop policy if exists broadcast_destination_rule_groups_insert_own_team on public.broadcast_destination_rule_groups;
drop policy if exists broadcast_destination_rule_groups_update_own_team on public.broadcast_destination_rule_groups;
drop policy if exists broadcast_destination_rule_groups_delete_own_team on public.broadcast_destination_rule_groups;

create policy broadcast_destination_rule_groups_select_own_team
  on public.broadcast_destination_rule_groups
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.team_broadcast_destinations d
      where d.id = broadcast_destination_rule_groups.destination_id
        and public.is_team_member(d.team_id)
    )
  );

create policy broadcast_destination_rule_groups_insert_own_team
  on public.broadcast_destination_rule_groups
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.team_broadcast_destinations d
      where d.id = broadcast_destination_rule_groups.destination_id
        and public.is_team_admin(d.team_id)
    )
  );

create policy broadcast_destination_rule_groups_update_own_team
  on public.broadcast_destination_rule_groups
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.team_broadcast_destinations d
      where d.id = broadcast_destination_rule_groups.destination_id
        and public.is_team_admin(d.team_id)
    )
  )
  with check (
    exists (
      select 1
      from public.team_broadcast_destinations d
      where d.id = broadcast_destination_rule_groups.destination_id
        and public.is_team_admin(d.team_id)
    )
  );

create policy broadcast_destination_rule_groups_delete_own_team
  on public.broadcast_destination_rule_groups
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.team_broadcast_destinations d
      where d.id = broadcast_destination_rule_groups.destination_id
        and public.is_team_admin(d.team_id)
    )
  );

alter table public.broadcast_destination_rules enable row level security;
drop policy if exists broadcast_destination_rules_select_own_team on public.broadcast_destination_rules;
drop policy if exists broadcast_destination_rules_insert_own_team on public.broadcast_destination_rules;
drop policy if exists broadcast_destination_rules_update_own_team on public.broadcast_destination_rules;
drop policy if exists broadcast_destination_rules_delete_own_team on public.broadcast_destination_rules;

create policy broadcast_destination_rules_select_own_team
  on public.broadcast_destination_rules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.broadcast_destination_rule_groups g
      join public.team_broadcast_destinations d on d.id = g.destination_id
      where g.id = broadcast_destination_rules.rule_group_id
        and public.is_team_member(d.team_id)
    )
  );

create policy broadcast_destination_rules_insert_own_team
  on public.broadcast_destination_rules
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.broadcast_destination_rule_groups g
      join public.team_broadcast_destinations d on d.id = g.destination_id
      where g.id = broadcast_destination_rules.rule_group_id
        and public.is_team_admin(d.team_id)
    )
  );

create policy broadcast_destination_rules_update_own_team
  on public.broadcast_destination_rules
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.broadcast_destination_rule_groups g
      join public.team_broadcast_destinations d on d.id = g.destination_id
      where g.id = broadcast_destination_rules.rule_group_id
        and public.is_team_admin(d.team_id)
    )
  )
  with check (
    exists (
      select 1
      from public.broadcast_destination_rule_groups g
      join public.team_broadcast_destinations d on d.id = g.destination_id
      where g.id = broadcast_destination_rules.rule_group_id
        and public.is_team_admin(d.team_id)
    )
  );

create policy broadcast_destination_rules_delete_own_team
  on public.broadcast_destination_rules
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.broadcast_destination_rule_groups g
      join public.team_broadcast_destinations d on d.id = g.destination_id
      where g.id = broadcast_destination_rules.rule_group_id
        and public.is_team_admin(d.team_id)
    )
  );


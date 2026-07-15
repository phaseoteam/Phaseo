create table if not exists public.gateway_preset_test_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  preset_id uuid references public.presets(id) on delete set null,
  baseline_preset_id uuid references public.presets(id) on delete set null,
  name text,
  description text,
  status text not null default 'pending',
  dataset_name text,
  config jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gateway_preset_test_runs_status_check
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

create index if not exists gateway_preset_test_runs_workspace_created_idx
  on public.gateway_preset_test_runs (workspace_id, created_at desc);

create index if not exists gateway_preset_test_runs_preset_created_idx
  on public.gateway_preset_test_runs (workspace_id, preset_id, created_at desc)
  where preset_id is not null;

create table if not exists public.gateway_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id text,
  session_id text,
  preset_id uuid references public.presets(id) on delete set null,
  test_run_id uuid references public.gateway_preset_test_runs(id) on delete set null,
  source text not null default 'api',
  rating text,
  score numeric,
  reason text,
  reason_tags text[] not null default '{}'::text[],
  comment text,
  metadata jsonb not null default '{}'::jsonb,
  metadata_dimensions jsonb not null default '{}'::jsonb,
  end_user_id text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint gateway_feedback_source_check
    check (source in ('api', 'user', 'system', 'import', 'test')),
  constraint gateway_feedback_rating_check
    check (
      rating is null or rating in (
        'thumbs_up',
        'thumbs_down',
        'correct',
        'partly_correct',
        'incorrect',
        'bad_format',
        'too_slow',
        'too_expensive',
        'unsafe',
        'refused_incorrectly',
        'not_helpful',
        'other'
      )
    ),
  constraint gateway_feedback_score_check
    check (score is null or (score >= 0 and score <= 1)),
  constraint gateway_feedback_metadata_dimensions_object_check
    check (jsonb_typeof(metadata_dimensions) = 'object'),
  constraint gateway_feedback_target_check
    check (
      request_id is not null
      or session_id is not null
      or preset_id is not null
      or test_run_id is not null
    )
);

create index if not exists gateway_feedback_workspace_created_idx
  on public.gateway_feedback (workspace_id, created_at desc);

create index if not exists gateway_feedback_request_created_idx
  on public.gateway_feedback (workspace_id, request_id, created_at desc)
  where request_id is not null;

create index if not exists gateway_feedback_session_created_idx
  on public.gateway_feedback (workspace_id, session_id, created_at desc)
  where session_id is not null;

create index if not exists gateway_feedback_preset_created_idx
  on public.gateway_feedback (workspace_id, preset_id, created_at desc)
  where preset_id is not null;

create index if not exists gateway_feedback_test_run_created_idx
  on public.gateway_feedback (workspace_id, test_run_id, created_at desc)
  where test_run_id is not null;

create index if not exists gateway_feedback_metadata_dimensions_idx
  on public.gateway_feedback using gin (metadata_dimensions jsonb_path_ops);

create table if not exists public.gateway_observability_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_id text,
  session_id text,
  preset_id uuid references public.presets(id) on delete set null,
  test_run_id uuid references public.gateway_preset_test_runs(id) on delete set null,
  category text not null default 'custom',
  event_name text not null,
  value jsonb,
  numeric_value numeric,
  metadata jsonb not null default '{}'::jsonb,
  metadata_dimensions jsonb not null default '{}'::jsonb,
  end_user_id text,
  source text not null default 'api',
  occurred_at timestamptz not null default now(),
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint gateway_observability_events_category_check
    check (category in ('feedback', 'behavior', 'outcome', 'app', 'test', 'custom')),
  constraint gateway_observability_events_source_check
    check (source in ('api', 'user', 'system', 'import', 'test')),
  constraint gateway_observability_events_name_check
    check (length(btrim(event_name)) between 1 and 128),
  constraint gateway_observability_events_metadata_dimensions_object_check
    check (jsonb_typeof(metadata_dimensions) = 'object'),
  constraint gateway_observability_events_target_check
    check (
      request_id is not null
      or session_id is not null
      or preset_id is not null
      or test_run_id is not null
    )
);

create index if not exists gateway_observability_events_workspace_occurred_idx
  on public.gateway_observability_events (workspace_id, occurred_at desc);

create index if not exists gateway_observability_events_request_occurred_idx
  on public.gateway_observability_events (workspace_id, request_id, occurred_at desc)
  where request_id is not null;

create index if not exists gateway_observability_events_session_occurred_idx
  on public.gateway_observability_events (workspace_id, session_id, occurred_at desc)
  where session_id is not null;

create index if not exists gateway_observability_events_preset_occurred_idx
  on public.gateway_observability_events (workspace_id, preset_id, occurred_at desc)
  where preset_id is not null;

create index if not exists gateway_observability_events_metadata_dimensions_idx
  on public.gateway_observability_events using gin (metadata_dimensions jsonb_path_ops);

create table if not exists public.gateway_preset_test_run_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  test_run_id uuid not null references public.gateway_preset_test_runs(id) on delete cascade,
  preset_id uuid references public.presets(id) on delete set null,
  request_id text,
  input jsonb not null default '{}'::jsonb,
  expected_output jsonb,
  actual_output jsonb,
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  feedback_id uuid references public.gateway_feedback(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gateway_preset_test_run_items_status_check
    check (status in ('pending', 'running', 'passed', 'failed', 'error', 'skipped'))
);

create index if not exists gateway_preset_test_run_items_run_created_idx
  on public.gateway_preset_test_run_items (workspace_id, test_run_id, created_at desc);

alter table public.gateway_preset_test_runs enable row level security;
alter table public.gateway_feedback enable row level security;
alter table public.gateway_observability_events enable row level security;
alter table public.gateway_preset_test_run_items enable row level security;

revoke all on public.gateway_preset_test_runs from anon;
revoke all on public.gateway_feedback from anon;
revoke all on public.gateway_observability_events from anon;
revoke all on public.gateway_preset_test_run_items from anon;

drop policy if exists gateway_preset_test_runs_select_workspace on public.gateway_preset_test_runs;
create policy gateway_preset_test_runs_select_workspace
  on public.gateway_preset_test_runs
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists gateway_feedback_select_workspace on public.gateway_feedback;
create policy gateway_feedback_select_workspace
  on public.gateway_feedback
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists gateway_observability_events_select_workspace on public.gateway_observability_events;
create policy gateway_observability_events_select_workspace
  on public.gateway_observability_events
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists gateway_preset_test_run_items_select_workspace on public.gateway_preset_test_run_items;
create policy gateway_preset_test_run_items_select_workspace
  on public.gateway_preset_test_run_items
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists gateway_preset_test_runs_all_service on public.gateway_preset_test_runs;
create policy gateway_preset_test_runs_all_service
  on public.gateway_preset_test_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists gateway_feedback_all_service on public.gateway_feedback;
create policy gateway_feedback_all_service
  on public.gateway_feedback
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists gateway_observability_events_all_service on public.gateway_observability_events;
create policy gateway_observability_events_all_service
  on public.gateway_observability_events
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists gateway_preset_test_run_items_all_service on public.gateway_preset_test_run_items;
create policy gateway_preset_test_run_items_all_service
  on public.gateway_preset_test_run_items
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.gateway_preset_test_runs to authenticated;
grant select on public.gateway_feedback to authenticated;
grant select on public.gateway_observability_events to authenticated;
grant select on public.gateway_preset_test_run_items to authenticated;

grant select, insert, update, delete on public.gateway_preset_test_runs to service_role;
grant select, insert, update, delete on public.gateway_feedback to service_role;
grant select, insert, update, delete on public.gateway_observability_events to service_role;
grant select, insert, update, delete on public.gateway_preset_test_run_items to service_role;

comment on table public.gateway_feedback is
  'Developer- and user-supplied feedback signals linked to gateway requests, sessions, presets, and preset test runs.';

comment on table public.gateway_observability_events is
  'Custom production outcome and behavior events linked to gateway requests, sessions, presets, and preset test runs.';

comment on table public.gateway_preset_test_runs is
  'Preset comparison and evaluation run metadata for grouping feedback, events, and request outcomes.';

comment on column public.gateway_feedback.metadata_dimensions is
  'Bounded flat string map for indexed cohort and segment filters. Full arbitrary metadata remains in metadata.';

comment on column public.gateway_observability_events.metadata_dimensions is
  'Bounded flat string map for indexed cohort and segment filters. Full arbitrary metadata remains in metadata.';


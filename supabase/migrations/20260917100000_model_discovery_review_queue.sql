-- Keep model-discovery detections in an internal, reviewable queue.
--
-- This is deliberately separate from the observed provider snapshot. A
-- provider can be checked frequently without making a newly discovered model
-- routable or public automatically.

create table if not exists public.model_discovery_review_items (
  id uuid not null default gen_random_uuid(),
  dedupe_key text not null,
  run_id uuid references public.model_discovery_runs(id) on delete set null,
  source text not null,
  provider_id text not null,
  provider_name text not null,
  model_id text not null,
  change_type text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  constraint model_discovery_review_items_pkey primary key (id),
  constraint model_discovery_review_items_dedupe_key_unique unique (dedupe_key),
  constraint model_discovery_review_items_change_type_check
    check (change_type in ('added', 'removed')),
  constraint model_discovery_review_items_status_check
    check (status in ('pending', 'in_progress', 'approved', 'rejected', 'snoozed')),
  constraint model_discovery_review_items_model_id_check
    check (nullif(trim(model_id), '') is not null)
);

create index if not exists model_discovery_review_items_status_idx
  on public.model_discovery_review_items (status, last_detected_at desc);
create index if not exists model_discovery_review_items_provider_idx
  on public.model_discovery_review_items (provider_id, last_detected_at desc);

create table if not exists public.model_discovery_review_events (
  id uuid not null default gen_random_uuid(),
  item_id uuid not null references public.model_discovery_review_items(id) on delete cascade,
  decision text not null,
  reason text,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint model_discovery_review_events_pkey primary key (id),
  constraint model_discovery_review_events_decision_check
    check (decision in ('in_progress', 'approved', 'rejected', 'snoozed')),
  constraint model_discovery_review_events_reason_check
    check (decision in ('in_progress', 'approved') or nullif(trim(reason), '') is not null)
);

create index if not exists model_discovery_review_events_item_idx
  on public.model_discovery_review_events (item_id, created_at desc);

revoke all on public.model_discovery_review_items from anon, authenticated;
grant all on public.model_discovery_review_items to service_role;
revoke all on public.model_discovery_review_events from anon, authenticated;
grant select, insert on public.model_discovery_review_events to service_role;

alter table public.model_discovery_review_items enable row level security;
alter table public.model_discovery_review_events enable row level security;

create policy deny_direct_client_access on public.model_discovery_review_items
  as restrictive for all to anon, authenticated
  using (false) with check (false);

create policy deny_direct_client_access on public.model_discovery_review_events
  as restrictive for all to anon, authenticated
  using (false) with check (false);

comment on table public.model_discovery_review_items is
  'Internal review queue for provider model additions and confirmed removals detected by the Cloudflare watcher.';
comment on table public.model_discovery_review_events is
  'Append-only audit history for model-discovery review decisions.';

-- Keep public catalog announcements on the same database-backed Cloudflare
-- path as provider discovery. New models remain pending until Discord delivery
-- succeeds, while the first run establishes a baseline without sending noise.
create table if not exists public.model_discovery_public_announcements (
  model_slug text not null,
  status text not null default 'pending',
  last_run_id uuid references public.model_discovery_runs(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  announced_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint model_discovery_public_announcements_pkey primary key (model_slug),
  constraint model_discovery_public_announcements_status_check
    check (status in ('baseline', 'pending', 'announced')),
  constraint model_discovery_public_announcements_attempt_count_check
    check (attempt_count >= 0),
  constraint model_discovery_public_announcements_model_slug_check
    check (nullif(trim(model_slug), '') is not null)
);

create index if not exists model_discovery_public_announcements_status_idx
  on public.model_discovery_public_announcements (status, updated_at desc);

revoke all on public.model_discovery_public_announcements from anon, authenticated;
grant all on public.model_discovery_public_announcements to service_role;

alter table public.model_discovery_public_announcements enable row level security;

create policy deny_direct_client_access on public.model_discovery_public_announcements
  as restrictive for all to anon, authenticated
  using (false) with check (false);

comment on table public.model_discovery_public_announcements is
  'Database-backed cursor for public Phaseo model catalog announcements.';

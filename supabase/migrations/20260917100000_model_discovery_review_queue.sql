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
  claim_run_id uuid references public.model_discovery_runs(id) on delete set null,
  claim_expires_at timestamptz,
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
create index if not exists model_discovery_public_announcements_claim_idx
  on public.model_discovery_public_announcements (status, claim_expires_at, updated_at desc);

revoke all on public.model_discovery_public_announcements from anon, authenticated;
grant all on public.model_discovery_public_announcements to service_role;

alter table public.model_discovery_public_announcements enable row level security;

create policy deny_direct_client_access on public.model_discovery_public_announcements
  as restrictive for all to anon, authenticated
  using (false) with check (false);

comment on table public.model_discovery_public_announcements is
  'Database-backed cursor for public Phaseo model catalog announcements.';

-- Keep review-item rediscovery idempotent without overwriting a human decision.
-- Detection fields are refreshed on conflict; status and review metadata remain
-- owned by the review workflow.
create or replace function public.upsert_model_discovery_review_items(p_rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'model discovery review rows must be a JSON array';
  end if;

  insert into public.model_discovery_review_items (
    dedupe_key,
    run_id,
    source,
    provider_id,
    provider_name,
    model_id,
    change_type,
    details,
    last_detected_at
  )
  select
    nullif(trim(entry->>'dedupe_key'), ''),
    nullif(trim(entry->>'run_id'), '')::uuid,
    entry->>'source',
    entry->>'provider_id',
    entry->>'provider_name',
    entry->>'model_id',
    entry->>'change_type',
    case when jsonb_typeof(entry->'details') = 'object' then entry->'details' else '{}'::jsonb end,
    coalesce(nullif(trim(entry->>'last_detected_at'), '')::timestamptz, now())
  from jsonb_array_elements(p_rows) as entries(entry)
  where nullif(trim(entry->>'dedupe_key'), '') is not null
  on conflict (dedupe_key) do update set
    run_id = excluded.run_id,
    source = excluded.source,
    provider_id = excluded.provider_id,
    provider_name = excluded.provider_name,
    model_id = excluded.model_id,
    change_type = excluded.change_type,
    details = excluded.details,
    last_detected_at = excluded.last_detected_at;
end;
$$;

-- Claim pending public announcements with a short lease so overlapping
-- scheduled runs cannot deliver the same announcement concurrently. A later
-- run can recover rows whose lease expired.
create or replace function public.claim_model_discovery_public_announcements(
  p_run_id uuid,
  p_model_slugs text[],
  p_now timestamptz,
  p_lease_seconds integer default 300
)
returns table(model_slug text, attempt_count integer)
language sql
security invoker
set search_path = public
as $$
  update public.model_discovery_public_announcements
  set
    claim_run_id = p_run_id,
    claim_expires_at = coalesce(p_now, now()) + make_interval(secs => greatest(coalesce(p_lease_seconds, 300), 1)),
    last_run_id = p_run_id,
    updated_at = coalesce(p_now, now())
  where model_slug = any(coalesce(p_model_slugs, array[]::text[]))
    and status = 'pending'
    and (
      claim_run_id is null
      or claim_expires_at <= coalesce(p_now, now())
      or claim_run_id = p_run_id
    )
  returning model_slug, attempt_count;
$$;

-- Apply a review decision and append its audit event in one database
-- transaction. The API can therefore never commit one without the other.
create or replace function public.record_model_discovery_review_decision(
  p_item_id uuid,
  p_decision text,
  p_reason text,
  p_actor_user_id uuid,
  p_reviewed_at timestamptz default now()
)
returns setof public.model_discovery_review_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_item public.model_discovery_review_items;
begin
  if p_decision not in ('in_progress', 'approved', 'rejected', 'snoozed') then
    raise exception 'invalid model discovery review decision';
  end if;

  if p_decision in ('rejected', 'snoozed') and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'a reason is required for this review decision';
  end if;

  update public.model_discovery_review_items
  set
    status = p_decision,
    reviewed_by = p_actor_user_id,
    reviewed_at = coalesce(p_reviewed_at, now()),
    review_note = case
      when p_decision in ('approved', 'in_progress') then null
      else nullif(trim(p_reason), '')
    end
  where id = p_item_id
  returning * into updated_item;

  if not found then
    return;
  end if;

  insert into public.model_discovery_review_events (
    item_id,
    decision,
    reason,
    actor_user_id
  ) values (
    p_item_id,
    p_decision,
    nullif(trim(p_reason), ''),
    p_actor_user_id
  );

  return next updated_item;
end;
$$;

revoke all on function public.upsert_model_discovery_review_items(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_model_discovery_review_items(jsonb) to service_role;
revoke all on function public.claim_model_discovery_public_announcements(uuid, text[], timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_model_discovery_public_announcements(uuid, text[], timestamptz, integer) to service_role;
revoke all on function public.record_model_discovery_review_decision(uuid, text, text, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.record_model_discovery_review_decision(uuid, text, text, uuid, timestamptz) to service_role;

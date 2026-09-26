-- Register Ultrafast and preserve its request facts for routing and billing analytics.

insert into public.v2_service_tiers (service_tier_slug, display_name, status, metadata)
values (
  'ultrafast',
  'Ultrafast',
  'active',
  jsonb_build_object('source', 'v2_canonical')
)
on conflict (service_tier_slug) do update set
  display_name = excluded.display_name,
  status = excluded.status,
  metadata = public.v2_service_tiers.metadata || excluded.metadata,
  updated_at = now();

create or replace function public.normalize_v2_service_tier(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case lower(nullif(trim(p_value), ''))
    when 'default' then 'standard'
    when 'fast' then 'priority'
    when 'priority' then 'priority'
    when 'standard' then 'standard'
    when 'ultrafast' then 'ultrafast'
    when 'flex' then 'flex'
    when 'batch' then 'batch'
    else null
  end;
$$;

alter table public.v2_request_facts
  drop constraint if exists v2_request_facts_service_tier_requested_check,
  drop constraint if exists v2_request_facts_service_tier_observed_check,
  drop constraint if exists v2_request_facts_service_tier_slug_check;

alter table public.v2_request_facts
  add constraint v2_request_facts_service_tier_requested_check
    check (service_tier_requested is null or service_tier_requested in ('standard', 'priority', 'ultrafast', 'flex', 'batch')) not valid,
  add constraint v2_request_facts_service_tier_observed_check
    check (service_tier_observed is null or service_tier_observed in ('standard', 'priority', 'ultrafast', 'flex', 'batch')) not valid,
  add constraint v2_request_facts_service_tier_slug_check
    check (service_tier_slug is null or service_tier_slug in ('standard', 'priority', 'ultrafast', 'flex', 'batch')) not valid;

alter table public.v2_request_facts
  validate constraint v2_request_facts_service_tier_requested_check;
alter table public.v2_request_facts
  validate constraint v2_request_facts_service_tier_observed_check;
alter table public.v2_request_facts
  validate constraint v2_request_facts_service_tier_slug_check;

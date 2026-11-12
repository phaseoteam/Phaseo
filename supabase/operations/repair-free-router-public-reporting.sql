-- Authorized incident repair only. Repeat until restored_requests = 0.
-- Each batch is atomic; the table lock prevents ingestion while its privacy
-- trigger is disabled. All other reporting/correction triggers remain active.
-- Never broaden this predicate to currently visible historical private rows.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
lock table public.v2_models, public.v2_model_provider_routes in share mode;
alter table public.v2_request_facts disable trigger set_public_reporting_scope;

create temporary table free_router_repair_candidates on commit drop as
select fact.request_event_id
from public.v2_request_facts fact
join public.v2_models model on model.model_slug = fact.routed_model_slug
join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
join public.gateway_requests original
  on original.id = fact.gateway_request_id and original.created_at = fact.gateway_request_created_at
where fact.occurred_at >= timestamptz '2026-10-09 00:00:00+00'
  and fact.occurred_at < now()
  and original.created_at >= timestamptz '2026-10-09 00:00:00+00'
  and not fact.public_reporting_allowed
  and fact.requested_model_input = 'phaseo/free'
  and fact.success is true and original.success is true
  and fact.safe_metadata->>'testing_mode' = 'false'
  and original.detail_metadata->>'testing_mode' = 'false'
  -- The authoritative record retained the router placeholder: this is the
  -- precise ingestion bug, not a named hidden model subsequently released.
  and original.model_id = 'phaseo/free' and original.canonical_model_id = 'phaseo/free'
  and original.routed_model_id is null and original.requested_model_id is null
  and route.provider_slug = original.provider and route.model_slug = fact.routed_model_slug
  and model.updated_at < timestamptz '2026-10-09 00:00:00+00'
  and route.updated_at < timestamptz '2026-10-09 00:00:00+00'
  and public.public_reporting_route_is_visible(fact.routed_model_slug, fact.provider_model_id, null, fact.occurred_at)
  and public.public_reporting_route_is_visible(fact.routed_model_slug, fact.provider_model_id)
  -- Retained public facts prove this exact route was public before regression;
  -- the unchanged catalogue timestamps rule out a subsequent private release.
  and exists (
    select 1 from public.v2_request_facts witness
    where witness.provider_model_id = fact.provider_model_id
      and witness.routed_model_slug = fact.routed_model_slug
      and witness.occurred_at >= timestamptz '2026-10-07 00:00:00+00'
      and witness.occurred_at < timestamptz '2026-10-09 00:00:00+00'
      and witness.public_reporting_allowed and witness.success
  )
  and exists (
    select 1 from public.v2_request_attempts attempt
    where attempt.request_event_id = fact.request_event_id
      and attempt.success and attempt.provider_model_id = fact.provider_model_id
  )
  -- Mixed private/public attempts and missing route evidence are ambiguous.
  and not exists (
    select 1 from public.v2_request_attempts attempt
    left join public.v2_model_provider_routes attempted_route
      on attempted_route.provider_model_id = attempt.provider_model_id
    where attempt.request_event_id = fact.request_event_id
      and (attempted_route.provider_model_id is null
        or not public.public_reporting_route_is_visible(attempted_route.model_slug,
          attempted_route.provider_model_id, null, fact.occurred_at)
        or (attempt.success and attempt.provider_model_id <> fact.provider_model_id))
  )
order by fact.occurred_at, fact.request_event_id
limit 1000;

with restored as (
  update public.v2_request_facts fact set public_reporting_allowed = true
  from free_router_repair_candidates approved
  where fact.request_event_id = approved.request_event_id and not fact.public_reporting_allowed
  returning fact.request_event_id
)
select count(*) as restored_requests from restored;

alter table public.v2_request_facts enable trigger set_public_reporting_scope;
commit;

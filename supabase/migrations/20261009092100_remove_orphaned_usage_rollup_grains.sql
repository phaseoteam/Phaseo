-- phaseo:allow-destructive-migration reason: delete rollup grains with no matching request facts; facts are never pruned, so these only double-count re-attributed requests
-- Rollup grains are recomputed per (date or hour, workspace, app, model, provider
-- model, colo) from request facts. Before private.v2_analytics_previous_grains
-- (2026-10-03), re-attributing a fact (for example app_id cleared) recomputed
-- the new grain but left the old one, so those requests were counted twice. On
-- production (2026-10-09) 213 public daily, 288 public hourly and 213 private
-- daily grains matched no fact, all last refreshed between 2026-07-26 and
-- 2026-08-27. Facts reach back to the first rollup day, so a grain with no fact
-- has nothing left to represent. Meters cascade.
set local statement_timeout = '120s';

delete from public.v2_public_usage_daily rollup
where not exists (
  select 1 from public.v2_request_facts fact
  where fact.occurred_at >= rollup.usage_date::timestamptz
    and fact.occurred_at < (rollup.usage_date + 1)::timestamptz
    and fact.app_id is not distinct from rollup.app_id
    and coalesce(fact.routed_model_slug, fact.requested_model_slug) = rollup.model_slug
    and fact.provider_model_id is not distinct from rollup.provider_model_id
    and fact.cloudflare_colo is not distinct from rollup.cloudflare_colo
);

delete from public.v2_public_usage_hourly rollup
where not exists (
  select 1 from public.v2_request_facts fact
  where fact.occurred_at >= rollup.bucket_start
    and fact.occurred_at < rollup.bucket_start + interval '1 hour'
    and fact.app_id is not distinct from rollup.app_id
    and coalesce(fact.routed_model_slug, fact.requested_model_slug) = rollup.model_slug
    and fact.provider_model_id is not distinct from rollup.provider_model_id
    and fact.cloudflare_colo is not distinct from rollup.cloudflare_colo
);

delete from public.v2_private_usage_daily rollup
where not exists (
  select 1 from public.v2_request_facts fact
  where fact.occurred_at >= rollup.usage_date::timestamptz
    and fact.occurred_at < (rollup.usage_date + 1)::timestamptz
    and fact.workspace_id = rollup.workspace_id
    and fact.app_id is not distinct from rollup.app_id
    and coalesce(fact.routed_model_slug, fact.requested_model_slug) = rollup.model_slug
    and fact.provider_model_id is not distinct from rollup.provider_model_id
    and fact.cloudflare_colo is not distinct from rollup.cloudflare_colo
);

-- Publish anonymous aggregate performance, token, and cache telemetry from the
-- first request. Raw request content, identifiers, and exact request timestamps
-- remain outside these public reporting functions.
--
-- These functions already contain the current visibility and stealth-provider
-- protections. Rewriting only their explicit cohort checks avoids duplicating
-- several large analytics queries in this policy-only migration.
do $migration$
declare
  function_signature text;
  function_definition text;
  updated_definition text;
begin
  foreach function_signature in array array[
    'public.get_v2_model_performance_metrics(text,text,numeric,text,text)',
    'public.get_v2_model_provider_percentile_series_v2(text,text,text,text)',
    'public.get_v2_model_performance_colos(text)',
    'public.get_v2_model_cached_input_metrics(text,text,text,text)',
    'public.get_v2_model_provider_hourly_performance_v2(text,text,numeric,text,text)',
    'public.get_v2_model_quality_hourly_v1(text,text,text,text)'
  ]
  loop
    select pg_get_functiondef(function_signature::regprocedure)
      into function_definition;

    updated_definition := replace(function_definition, '>= 20', '>= 1');
    if updated_definition = function_definition then
      raise exception 'Expected a 20-request cohort check in %', function_signature;
    end if;

    execute updated_definition;
  end loop;
end
$migration$;

comment on function public.get_v2_model_cached_input_metrics(text, text, text, text) is
  'Token-weighted cached input percentage over time and by provider, available from the first aggregated request.';
comment on function public.get_v2_model_provider_hourly_performance_v2(text, text, numeric, text, text) is
  'Hourly provider performance, quality success rates, token counts, and cache telemetry, available from the first aggregated request.';
comment on function public.get_v2_model_quality_hourly_v1(text, text, text, text) is
  'Hourly tool-calling, structured-output, token, and cache aggregates, available from the first aggregated request.';

-- App attribution is explicitly opt-in through api_apps.is_public and requires
-- ten requests for this model before the app is named publicly.
create or replace function public.get_v2_model_apps(p_model_slug text, p_limit integer default 24)
returns table (
  app_id uuid,
  title text,
  image_url text,
  url text,
  last_seen timestamptz,
  requests bigint,
  success_requests bigint,
  total_tokens numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with app_usage as (
    select rollup.app_id,
      sum(rollup.requests)::bigint as requests,
      sum(rollup.successful_requests)::bigint as success_requests,
      sum(coalesce(meters.total_tokens, 0))::numeric as total_tokens,
      max(rollup.usage_date)::timestamptz as last_seen
    from public.v2_public_usage_daily rollup
    left join lateral (
      select sum(quantity) as total_tokens
      from public.v2_public_usage_daily_meters meter
      where meter.rollup_id = rollup.rollup_id
        and meter.meter_key in ('input_tokens', 'output_tokens', 'reasoning_tokens')
    ) meters on true
    where rollup.model_slug = lower(trim(p_model_slug))
      and rollup.app_id is not null
    group by rollup.app_id
  )
  select usage.app_id, apps.title, apps.image_url, apps.url, usage.last_seen,
    usage.requests, usage.success_requests, usage.total_tokens
  from app_usage usage
  join public.api_apps apps on apps.id = usage.app_id
  where coalesce(apps.is_public, false)
    and usage.requests >= 10
  order by usage.total_tokens desc, usage.requests desc, usage.app_id
  limit greatest(1, least(coalesce(p_limit, 24), 100));
$$;

revoke all on function public.get_v2_model_apps(text, integer) from public, anon, authenticated;
grant execute on function public.get_v2_model_apps(text, integer) to service_role;

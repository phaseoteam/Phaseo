-- Provider health is based on our own request attempts. A failed first attempt
-- remains visible even when the logical request succeeds after failover.
create table if not exists public.v2_public_provider_health_daily (
  usage_date date not null,
  model_slug text not null references public.v2_models(model_slug) on delete cascade,
  provider_model_id text,
  provider_slug text not null,
  request_count bigint not null default 0,
  successful_request_count bigint not null default 0,
  attempt_count bigint not null default 0,
  successful_attempts bigint not null default 0,
  failed_attempts bigint not null default 0,
  fallback_attempts bigint not null default 0,
  latency_sum_ms bigint not null default 0,
  latency_count bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (usage_date, model_slug, provider_slug, provider_model_id)
);

create index if not exists v2_public_provider_health_model_idx
  on public.v2_public_provider_health_daily(model_slug, usage_date desc, provider_slug);

with attempt_source as (
  select fact.request_event_id, fact.occurred_at, coalesce(fact.routed_model_slug, fact.requested_model_slug) as model_slug,
    fact.provider_model_id, fact.success, fact.latency_ms, false as is_fallback
  from public.v2_request_facts fact
  where not exists (select 1 from public.v2_request_attempts attempt where attempt.request_event_id = fact.request_event_id)
  union all
  select fact.request_event_id, fact.occurred_at, coalesce(fact.routed_model_slug, fact.requested_model_slug),
    attempt.provider_model_id, attempt.success, attempt.latency_ms, attempt.attempt_number > 1
  from public.v2_request_attempts attempt
  join public.v2_request_facts fact on fact.request_event_id = attempt.request_event_id
), grouped as (
  select source.occurred_at::date as usage_date, source.model_slug, source.provider_model_id,
    coalesce(route.provider_slug, source.provider_model_id, 'unknown') as provider_slug,
    count(distinct source.request_event_id)::bigint as request_count,
    count(distinct source.request_event_id) filter (where source.success)::bigint as successful_request_count,
    count(*)::bigint as attempt_count,
    count(*) filter (where source.success)::bigint as successful_attempts,
    count(*) filter (where not source.success)::bigint as failed_attempts,
    count(*) filter (where source.is_fallback)::bigint as fallback_attempts,
    coalesce(sum(source.latency_ms) filter (where source.latency_ms is not null), 0)::bigint as latency_sum_ms,
    count(source.latency_ms)::bigint as latency_count
  from attempt_source source
  left join public.v2_model_provider_routes route on route.provider_model_id = source.provider_model_id
  where source.model_slug is not null and source.provider_model_id is not null
  group by source.occurred_at::date, source.model_slug, source.provider_model_id, route.provider_slug
)
insert into public.v2_public_provider_health_daily (usage_date, model_slug, provider_model_id, provider_slug, request_count, successful_request_count, attempt_count, successful_attempts, failed_attempts, fallback_attempts, latency_sum_ms, latency_count)
select usage_date, model_slug, provider_model_id, provider_slug, request_count, successful_request_count, attempt_count, successful_attempts, failed_attempts, fallback_attempts, latency_sum_ms, latency_count
from grouped
on conflict (usage_date, model_slug, provider_slug, provider_model_id) do update set request_count = excluded.request_count,
  successful_request_count = excluded.successful_request_count,
  attempt_count = excluded.attempt_count, successful_attempts = excluded.successful_attempts, failed_attempts = excluded.failed_attempts,
  fallback_attempts = excluded.fallback_attempts, latency_sum_ms = excluded.latency_sum_ms, latency_count = excluded.latency_count,
  updated_at = now();

alter table public.v2_public_provider_health_daily enable row level security;
drop policy if exists v2_public_provider_health_daily_public_select on public.v2_public_provider_health_daily;
create policy v2_public_provider_health_daily_public_select on public.v2_public_provider_health_daily for select to anon, authenticated using (true);
grant select on public.v2_public_provider_health_daily to anon, authenticated;
grant insert, update, delete on public.v2_public_provider_health_daily to service_role;

create or replace function public.get_v2_model_provider_health(p_model_slug text, p_window_days integer default 3)
returns table (
  provider_id text, provider_name text, requests bigint, success_requests bigint, failed_requests bigint,
  health_requests bigint, health_success_requests bigint, failed_attempts bigint, fallback_attempts bigint,
  uptime_pct numeric, request_success_pct numeric, failure_pct numeric, avg_latency_ms numeric,
  buckets jsonb, last_request_at date
)
language sql stable security invoker set search_path = public
as $$
  select health.provider_slug, max(provider.name), sum(health.request_count)::bigint,
    sum(health.successful_request_count)::bigint, sum(health.request_count - health.successful_request_count)::bigint,
    sum(health.attempt_count)::bigint, sum(health.successful_attempts)::bigint, sum(health.failed_attempts)::bigint,
    sum(health.fallback_attempts)::bigint,
    case when sum(health.attempt_count) > 0 then sum(health.successful_attempts) * 100.0 / sum(health.attempt_count) else null end,
    case when sum(health.request_count) > 0 then sum(health.successful_request_count) * 100.0 / sum(health.request_count) else null end,
    case when sum(health.attempt_count) > 0 then sum(health.failed_attempts) * 100.0 / sum(health.attempt_count) else null end,
    case when sum(health.latency_count) > 0 then sum(health.latency_sum_ms)::numeric / sum(health.latency_count) else null end,
    jsonb_agg(jsonb_build_object('day', health.usage_date, 'requests', health.request_count, 'attempts', health.attempt_count,
      'successful_attempts', health.successful_attempts, 'failed_attempts', health.failed_attempts,
      'fallback_attempts', health.fallback_attempts) order by health.usage_date), max(health.usage_date)
  from public.v2_public_provider_health_daily health
  left join public.v2_providers provider on provider.provider_slug = health.provider_slug
  where health.model_slug = lower(trim(p_model_slug))
    and health.usage_date >= current_date - greatest(1, least(coalesce(p_window_days, 3), 90))
  group by health.provider_slug
  order by sum(health.failed_attempts) desc, health.provider_slug;
$$;
grant execute on function public.get_v2_model_provider_health(text, integer) to anon, authenticated, service_role;

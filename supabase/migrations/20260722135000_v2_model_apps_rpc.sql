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
security invoker
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
  order by usage.total_tokens desc, usage.requests desc, usage.app_id
  limit greatest(1, least(coalesce(p_limit, 24), 100));
$$;

grant execute on function public.get_v2_model_apps(text, integer) to anon, authenticated, service_role;

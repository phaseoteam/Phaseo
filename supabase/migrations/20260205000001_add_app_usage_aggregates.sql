-- Add public visibility flag and metadata for apps
alter table public.api_apps
  add column if not exists is_public boolean not null default false;
alter table public.api_apps
  add column if not exists image_url text;
create index if not exists idx_api_apps_public_active
  on public.api_apps (is_public, is_active);
-- Aggregate total tokens/requests for an app
create or replace function public.get_app_totals(
  p_app_id uuid
)
returns table (
  total_tokens bigint,
  total_requests bigint
) as $$
  select
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as total_tokens,
    count(*)::bigint as total_requests
  from public.gateway_requests gr
  where gr.app_id = p_app_id
    and gr.success = true;
$$ language sql stable;
-- Aggregate usage by day + model for an app
create or replace function public.get_app_usage_timeseries(
  p_app_id uuid,
  p_days integer default 28
)
returns table (
  bucket date,
  model_id text,
  tokens bigint,
  requests bigint
) as $$
  select
    date_trunc('day', gr.created_at)::date as bucket,
    coalesce(gr.model_id, 'Unknown model') as model_id,
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens,
    count(*)::bigint as requests
  from public.gateway_requests gr
  where gr.app_id = p_app_id
    and gr.success = true
    and gr.created_at >= now() - (p_days::text || ' days')::interval
  group by 1, 2
  order by 1, 2;
$$ language sql stable;
-- Top models for an app within a window
create or replace function public.get_app_top_models(
  p_app_id uuid,
  p_days integer default 28,
  p_limit integer default 6
)
returns table (
  model_id text,
  provider text,
  tokens bigint,
  requests bigint
) as $$
  select
    coalesce(gr.model_id, 'Unknown model') as model_id,
    gr.provider as provider,
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens,
    count(*)::bigint as requests
  from public.gateway_requests gr
  where gr.app_id = p_app_id
    and gr.success = true
    and gr.created_at >= now() - (p_days::text || ' days')::interval
  group by 1, 2
  order by tokens desc, requests desc
  limit p_limit;
$$ language sql stable;
-- Top model (all time) for an app
create or replace function public.get_app_top_model_all_time(
  p_app_id uuid
)
returns table (
  model_id text,
  provider text,
  tokens bigint
) as $$
  select
    coalesce(gr.model_id, 'Unknown model') as model_id,
    gr.provider as provider,
    sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens
  from public.gateway_requests gr
  where gr.app_id = p_app_id
    and gr.success = true
  group by 1, 2
  order by tokens desc
  limit 1;
$$ language sql stable;
-- Rising model in the last week vs previous week
create or replace function public.get_app_rising_model(
  p_app_id uuid,
  p_recent_days integer default 7,
  p_previous_days integer default 7
)
returns table (
  model_id text,
  provider text,
  recent_tokens bigint,
  previous_tokens bigint,
  delta_tokens bigint
) as $$
  with recent as (
    select
      coalesce(gr.model_id, 'Unknown model') as model_id,
      gr.provider as provider,
      sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens
    from public.gateway_requests gr
    where gr.app_id = p_app_id
      and gr.success = true
      and gr.created_at >= now() - (p_recent_days::text || ' days')::interval
    group by 1, 2
  ),
  previous as (
    select
      coalesce(gr.model_id, 'Unknown model') as model_id,
      gr.provider as provider,
      sum(coalesce((gr.usage->>'total_tokens')::bigint, 0))::bigint as tokens
    from public.gateway_requests gr
    where gr.app_id = p_app_id
      and gr.success = true
      and gr.created_at >= now() - ((p_recent_days + p_previous_days)::text || ' days')::interval
      and gr.created_at < now() - (p_recent_days::text || ' days')::interval
    group by 1, 2
  ),
  combined as (
    select
      r.model_id,
      r.provider,
      r.tokens as recent_tokens,
      coalesce(p.tokens, 0)::bigint as previous_tokens,
      (r.tokens - coalesce(p.tokens, 0))::bigint as delta_tokens
    from recent r
    left join previous p
      on p.model_id = r.model_id
      and (
        (p.provider is null and r.provider is null)
        or p.provider = r.provider
      )
  )
  select
    model_id,
    provider,
    recent_tokens,
    previous_tokens,
    delta_tokens
  from combined
  order by delta_tokens desc
  limit 1;
$$ language sql stable;

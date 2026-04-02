-- Extend public apps ranking windows and add week-over-week app growth ranking.

drop function if exists public.get_public_top_apps(integer, text);
create or replace function public.get_public_top_apps(
  p_limit integer default 20,
  p_time_range text default 'week'
)
returns table (
  app_id text,
  app_name text,
  requests bigint,
  tokens bigint,
  unique_models integer
) as $$
declare
  v_since timestamptz;
  v_now timestamptz := now();
begin
  case p_time_range
    when 'today' then v_since := date_trunc('day', v_now);
    when 'week' then v_since := v_now - interval '7 days';
    when '4w' then v_since := v_now - interval '28 days';
    when 'month' then v_since := date_trunc('month', v_now);
    else v_since := v_now - interval '7 days';
  end case;

  return query
  select
    gr.app_id::text as app_id,
    coalesce(aa.title, 'App-' || substring(md5(gr.app_id::text), 1, 8)) as app_name,
    count(*)::bigint as requests,
    sum(public.gateway_usage_total_tokens(gr.usage))::bigint as tokens,
    count(distinct nullif(gr.model_id, ''))::integer as unique_models
  from public.gateway_requests gr
  left join public.api_apps aa on gr.app_id = aa.id
  where gr.created_at >= v_since
    and gr.success is true
    and gr.app_id is not null
  group by gr.app_id, aa.title
  order by requests desc, tokens desc
  limit p_limit;
end;
$$ language plpgsql stable;

create or replace function public.get_public_trending_apps(
  p_limit integer default 20,
  p_min_week_tokens bigint default 0
)
returns table (
  app_id text,
  app_name text,
  current_week_tokens bigint,
  previous_week_tokens bigint,
  growth_tokens bigint,
  growth_pct numeric
) as $$
declare
  v_now timestamptz := now();
begin
  return query
  with weekly as (
    select
      gr.app_id::text as app_id,
      coalesce(aa.title, 'App-' || substring(md5(gr.app_id::text), 1, 8)) as app_name,
      sum(
        case
          when gr.created_at >= v_now - interval '7 days'
            then public.gateway_usage_total_tokens(gr.usage)
          else 0
        end
      )::bigint as week_0_tokens,
      sum(
        case
          when gr.created_at >= v_now - interval '14 days'
            and gr.created_at < v_now - interval '7 days'
            then public.gateway_usage_total_tokens(gr.usage)
          else 0
        end
      )::bigint as week_1_tokens
    from public.gateway_requests gr
    left join public.api_apps aa on gr.app_id = aa.id
    where gr.created_at >= v_now - interval '14 days'
      and gr.success is true
      and gr.app_id is not null
    group by gr.app_id, aa.title
  )
  select
    w.app_id,
    w.app_name,
    w.week_0_tokens as current_week_tokens,
    w.week_1_tokens as previous_week_tokens,
    (w.week_0_tokens - w.week_1_tokens)::bigint as growth_tokens,
    case
      when w.week_1_tokens > 0
        then round(((w.week_0_tokens - w.week_1_tokens)::numeric / w.week_1_tokens::numeric) * 100, 2)
      when w.week_0_tokens > 0
        then null
      else 0
    end as growth_pct
  from weekly w
  where w.week_0_tokens > w.week_1_tokens
    and w.week_0_tokens >= p_min_week_tokens
  order by (w.week_0_tokens - w.week_1_tokens) desc, w.week_0_tokens desc
  limit p_limit;
end;
$$ language plpgsql stable;

comment on function public.get_public_top_apps(integer, text) is
  'Top applications by usage for a requested time window (supports today/week/4w/month).';
comment on function public.get_public_trending_apps(integer, bigint) is
  'Top applications by week-over-week token growth.';

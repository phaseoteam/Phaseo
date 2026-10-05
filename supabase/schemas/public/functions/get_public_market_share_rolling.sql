create or replace function public.get_public_market_share_rolling(
  p_dimension text default 'organization', p_time_range text default 'week', p_as_of timestamptz default now()
)
returns table (name text, requests bigint, tokens bigint, share_pct numeric)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_from timestamptz;
begin
  v_from := case p_time_range
    when 'today' then (p_as_of at time zone 'UTC')::date::timestamp at time zone 'UTC'
    when '24h' then p_as_of - interval '24 hours'
    when 'week' then p_as_of - interval '168 hours'
    when '4w' then p_as_of - interval '672 hours'
    when 'month' then p_as_of - interval '720 hours'
    when 'year' then p_as_of - interval '8760 hours'
  end;
  if v_from is null or p_as_of is null or p_dimension is null or p_dimension not in ('organization','provider') then
    raise exception 'Invalid ranking period';
  end if;
  if v_from = p_as_of then return; end if;
  return query
  with grouped as (
    select case when p_dimension = 'provider' then u.provider_id else coalesce(l.name, m.lab_slug) end as name,
      sum(u.successful_requests)::bigint as requests,
      sum(public.public_ranking_metric_value('tokens', u.meters))::bigint as tokens
    from public.get_public_ranking_usage_window(v_from, p_as_of) u
    join public.v2_models m on m.model_slug = u.model_id
    left join public.v2_labs l on l.lab_slug = m.lab_slug
    group by 1
  )
  select g.name, g.requests, g.tokens,
    coalesce(round(g.requests::numeric / nullif(sum(g.requests) over (), 0) * 100, 2), 0)
  from grouped g where g.name is not null and g.requests > 0
  order by g.requests desc, g.name;
end;
$$;
revoke all on function public.get_public_market_share_rolling(text, text, timestamptz) from public;
grant execute on function public.get_public_market_share_rolling(text, text, timestamptz) to service_role;

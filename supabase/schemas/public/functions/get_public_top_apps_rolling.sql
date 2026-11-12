create or replace function public.get_public_top_apps_rolling(
  p_limit integer default 20, p_time_range text default 'week', p_as_of timestamptz default now()
)
returns table (app_id text, app_name text, requests bigint, tokens bigint, unique_models integer)
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
  if v_from is null or p_as_of is null then raise exception 'Invalid ranking period'; end if;
  if v_from = p_as_of then return; end if;
  return query
  with eligible_usage as (
    select public.api_app_url_group_key(a.url, a.id::text) as url_group,
      a.id::text as member_id, a.title as member_name, a.last_seen,
      u.model_id, u.requests, public.public_ranking_metric_value('tokens', u.meters) as tokens
    from public.get_public_ranking_usage_window(v_from, p_as_of) u
    join public.api_apps a on a.id = u.app_id and a.is_public = true and a.is_active = true
  ), member_totals as (
    select e.url_group, e.member_id, e.member_name, e.last_seen,
      sum(e.requests) as requests, sum(e.tokens) as tokens
    from eligible_usage e group by e.url_group, e.member_id, e.member_name, e.last_seen
  ), representatives as (
    select distinct on (m.url_group) m.url_group, m.member_id, m.member_name
    from member_totals m order by m.url_group, m.tokens desc, m.requests desc, m.last_seen desc nulls last, m.member_id
  ), totals as (
    select e.url_group, sum(e.requests)::bigint as requests, sum(e.tokens)::bigint as tokens,
      count(distinct e.model_id)::integer as models
    from eligible_usage e group by e.url_group
  )
  select r.member_id, r.member_name, t.requests, t.tokens, t.models
  from totals t join representatives r on r.url_group = t.url_group
  order by t.tokens desc, t.requests desc, r.member_id
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;
revoke all on function public.get_public_top_apps_rolling(integer, text, timestamptz) from public;
grant execute on function public.get_public_top_apps_rolling(integer, text, timestamptz) to service_role;

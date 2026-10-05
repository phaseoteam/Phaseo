create or replace function public.get_public_ranking_usage_window(p_from timestamptz, p_to timestamptz)
returns table (model_id text, provider_id text, app_id uuid, requests bigint,
  successful_requests bigint, tool_call_count bigint, meters jsonb)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_full_from date := (p_from at time zone 'UTC')::date + case
    when (p_from at time zone 'UTC')::time = time '00:00' then 0 else 1 end;
  v_full_to date := (p_to at time zone 'UTC')::date;
begin
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '365 days' then
    raise exception 'Invalid ranking window';
  end if;
  return query
  with edges as (
    select p_from as start_at, least(v_full_from::timestamp at time zone 'UTC', p_to) as end_at
    where p_from < (v_full_from::timestamp at time zone 'UTC')
    union all
    select greatest(v_full_to::timestamp at time zone 'UTC', p_from), p_to
    where (v_full_to::timestamp at time zone 'UTC') < p_to
      -- A range within a single UTC day is already entirely in the first edge.
      and v_full_to >= v_full_from
  ), daily_rows as materialized (
    select d.rollup_id, d.model_slug, d.provider_model_id, d.app_id,
      d.requests, d.successful_requests, d.tool_call_count
    from public.v2_public_usage_daily d
    where d.usage_date >= v_full_from and d.usage_date < v_full_to
  ), daily_meter_totals as (
    select u.rollup_id, u.meter_key, sum(u.quantity) as quantity
    from public.v2_public_usage_daily_meters u
    join daily_rows d on d.rollup_id = u.rollup_id
    group by u.rollup_id, u.meter_key
  ), daily_meters as (
    select m.rollup_id, jsonb_object_agg(m.meter_key, m.quantity) as meters
    from daily_meter_totals m group by m.rollup_id
  ), edge_rows as materialized (
    select f.request_event_id, f.routed_model_slug, f.requested_model_slug,
      f.provider_model_id, f.app_id, f.success, f.tool_call_count
    from edges e
    join public.v2_request_facts f on f.occurred_at >= e.start_at and f.occurred_at < e.end_at
    where lower(coalesce(f.routed_model_slug, f.requested_model_slug)) not in ('unknown', 'other')
  ), edge_meter_totals as (
    select u.request_event_id, u.meter_key, sum(u.quantity) as quantity
    from public.v2_request_usage u
    join edge_rows f on f.request_event_id = u.request_event_id
    group by u.request_event_id, u.meter_key
  ), edge_meters as (
    select m.request_event_id, jsonb_object_agg(m.meter_key, m.quantity) as meters
    from edge_meter_totals m group by m.request_event_id
  ), usage_rows as (
    select d.model_slug as model_id, d.provider_model_id, d.app_id, d.requests,
      d.successful_requests, d.tool_call_count, meter_values.meters
    from daily_rows d
    left join daily_meters meter_values on meter_values.rollup_id = d.rollup_id
    union all
    select coalesce(f.routed_model_slug, f.requested_model_slug), f.provider_model_id, f.app_id,
      1::bigint, case when f.success then 1 else 0 end::bigint, f.tool_call_count::bigint, meter_values.meters
    from edge_rows f
    left join edge_meters meter_values on meter_values.request_event_id = f.request_event_id
  )
  select u.model_id, r.provider_slug, u.app_id, u.requests, u.successful_requests, u.tool_call_count, coalesce(u.meters, '{}'::jsonb)
  from usage_rows u
  join public.v2_models m on m.model_slug = u.model_id and m.hidden = false and m.status <> 'disabled'
  join public.v2_model_provider_routes r on r.provider_model_id = u.provider_model_id
    and coalesce(r.is_stealth, false) = false and r.routing_enabled = true
    and r.status in ('active', 'degraded')
    and (r.effective_from is null or r.effective_from <= now())
    and (r.effective_to is null or r.effective_to > now())
  where lower(u.model_id) not in ('unknown', 'other');
end;
$$;
revoke all on function public.get_public_ranking_usage_window(timestamptz, timestamptz) from public;
grant execute on function public.get_public_ranking_usage_window(timestamptz, timestamptz) to service_role;

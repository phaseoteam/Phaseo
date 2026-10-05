SET local check_function_bodies = off;
SET local lock_timeout = '5s';
SET local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.get_public_context_length_distribution (
  p_days           integer DEFAULT 30,
  p_min_requests   bigint  DEFAULT 1,
  p_min_workspaces bigint  DEFAULT 1
)
  RETURNS TABLE (
    bucket_key      text,
    bucket_label    text,
    bucket_order    integer,
    min_tokens      bigint,
    max_tokens      bigint,
    requests        bigint,
    share_percent   numeric,
    workspace_count bigint
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with scoped_requests as (
    select fact.request_event_id, fact.workspace_id
    from public.v2_request_facts fact
    where fact.occurred_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
  ),
  per_request as (
    select
      request.request_event_id,
      request.workspace_id,
      coalesce(sum(usage.quantity) filter (
        where usage.meter_key in ('input_tokens', 'input_text_tokens', 'prompt_tokens')
      ), 0)::bigint as input_tokens
    from scoped_requests request
    left join public.v2_request_usage usage
      on usage.request_event_id = request.request_event_id
     and usage.meter_key in ('input_tokens', 'input_text_tokens', 'prompt_tokens')
    group by request.request_event_id, request.workspace_id
  ),
  eligible as (
    select * from per_request where input_tokens > 0
  ),
  totals as (
    select count(*)::bigint as requests, count(distinct workspace_id)::bigint as workspaces
    from eligible
  ),
  bucketed as (
    select
      workspace_id,
      case
        when input_tokens < 4096 then 'under_4k'
        when input_tokens < 16384 then '4k_16k'
        when input_tokens < 32768 then '16k_32k'
        when input_tokens < 65536 then '32k_64k'
        when input_tokens < 131072 then '64k_128k'
        else '128k_plus'
      end as bucket_key
    from eligible
  ),
  buckets(bucket_key, bucket_label, bucket_order, min_tokens, max_tokens) as (
    values
      ('under_4k', 'Under 4K', 1, 0::bigint, 4095::bigint),
        ('4k_16k', '4K–16K', 2, 4096::bigint, 16383::bigint),
        ('16k_32k', '16K–32K', 3, 16384::bigint, 32767::bigint),
        ('32k_64k', '32K–64K', 4, 32768::bigint, 65535::bigint),
        ('64k_128k', '64K–128K', 5, 65536::bigint, 131071::bigint),
      ('128k_plus', '128K+', 6, 131072::bigint, null::bigint)
  ),
  counts as (
    select bucket_key, count(*)::bigint as requests, count(distinct workspace_id)::bigint as workspace_count
    from bucketed
    group by bucket_key
  )
  select
    bucket.bucket_key,
    bucket.bucket_label,
    bucket.bucket_order,
    bucket.min_tokens,
    bucket.max_tokens,
    coalesce(counts.requests, 0)::bigint,
    case when total.requests > 0
      then round(coalesce(counts.requests, 0)::numeric / total.requests::numeric * 100, 2)
      else 0
    end,
    coalesce(counts.workspace_count, 0)::bigint
  from buckets bucket
  cross join totals total
  left join counts on counts.bucket_key = bucket.bucket_key
  where total.requests >= greatest(coalesce(p_min_requests, 1), 1)
    and total.workspaces >= greatest(coalesce(p_min_workspaces, 1), 1)
  order by bucket.bucket_order;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_ranking_usage_window (
  p_from timestamp with time zone,
  p_to   timestamp with time zone
)
  RETURNS TABLE (
    model_id            text,
    provider_id         text,
    app_id              uuid,
    requests            bigint,
    successful_requests bigint,
    tool_call_count     bigint,
    meters              jsonb
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
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
$function$;






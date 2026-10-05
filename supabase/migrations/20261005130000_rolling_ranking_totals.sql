-- Use daily aggregates only for whole UTC days. Read at most four partial-day
-- ranges from request facts so totals include today and exclude usage before
-- the exact cutoff. Never combine a daily bucket with its partial-day facts.
create or replace function public.public_ranking_metric_value(p_metric text, meters jsonb)
returns numeric
language sql immutable security invoker set search_path = ''
as $$
  select case p_metric
    when 'tokens' then coalesce((meters->>'total_tokens')::numeric,
      case when meters ? 'input_tokens' or meters ? 'output_tokens'
        then coalesce((meters->>'input_tokens')::numeric, 0) + coalesce((meters->>'output_tokens')::numeric, 0)
        else coalesce((meters->>'input_text_tokens')::numeric, 0) + coalesce((meters->>'output_text_tokens')::numeric, 0) end)
    when 'text_tokens' then coalesce((meters->>'input_text_tokens')::numeric, 0) + coalesce((meters->>'output_text_tokens')::numeric, 0)
    when 'image_inputs' then coalesce((meters->>'image_inputs')::numeric, (meters->>'input_images')::numeric, 0)
    when 'image_outputs' then coalesce((meters->>'image_outputs')::numeric, (meters->>'output_images')::numeric, 0)
    when 'audio_tokens' then coalesce((meters->>'input_audio_tokens')::numeric, 0) + coalesce((meters->>'output_audio_tokens')::numeric, 0)
    when 'audio_seconds' then coalesce((meters->>'audio_seconds')::numeric, 0)
    when 'speech_seconds' then coalesce((meters->>'speech_seconds')::numeric, 0)
    when 'transcription_seconds' then coalesce((meters->>'transcription_seconds')::numeric, 0)
    when 'video_tokens' then coalesce((meters->>'input_video_tokens')::numeric, 0) + coalesce((meters->>'output_video_tokens')::numeric, 0)
    when 'video_seconds' then coalesce((meters->>'video_seconds')::numeric, (meters->>'output_video_seconds')::numeric, 0)
    when 'cached_tokens' then coalesce((meters->>'cached_read_tokens')::numeric, (meters->>'cached_input_tokens')::numeric, 0) + coalesce((meters->>'cached_write_tokens')::numeric, (meters->>'cache_write_tokens')::numeric, 0)
    when 'embedding_tokens' then coalesce((meters->>'embedding_tokens')::numeric, 0)
    when 'rerank_quad_tokens' then coalesce((meters->>'rerank_quad_tokens')::numeric, 0)
    else 0
  end;
$$;
revoke all on function public.public_ranking_metric_value(text, jsonb) from public;
grant execute on function public.public_ranking_metric_value(text, jsonb) to service_role;

-- Shared bounded source for model, app and market-share totals. Retain the
-- provider/app grain so each consumer can group without losing observations.
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
  ), usage_rows as (
    select d.model_slug as model_id, d.provider_model_id, d.app_id, d.requests,
      d.successful_requests, d.tool_call_count, meter_values.meters
    from public.v2_public_usage_daily d
    left join lateral (
      select jsonb_object_agg(m.meter_key, m.quantity) as meters
      from (select u.meter_key, sum(u.quantity) as quantity from public.v2_public_usage_daily_meters u
        where u.rollup_id = d.rollup_id group by u.meter_key) m
    ) meter_values on true
    where d.usage_date >= v_full_from and d.usage_date < v_full_to
    union all
    select coalesce(f.routed_model_slug, f.requested_model_slug), f.provider_model_id, f.app_id,
      1::bigint, case when f.success then 1 else 0 end::bigint, f.tool_call_count::bigint, meter_values.meters
    from edges e
    join public.v2_request_facts f on f.occurred_at >= e.start_at and f.occurred_at < e.end_at
    left join lateral (
      select jsonb_object_agg(m.meter_key, m.quantity) as meters
      from (select u.meter_key, sum(u.quantity) as quantity from public.v2_request_usage u
        where u.request_event_id = f.request_event_id group by u.meter_key) m
    ) meter_values on true
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

create function public.get_public_period_leaderboard(
  p_metric text default 'text_tokens',
  p_days integer default 7,
  p_as_of timestamptz default now()
)
returns table (model_id text, current numeric, previous numeric)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if p_days is null or p_days not in (1, 7, 30) or p_as_of is null
    or p_metric is null or p_metric not in (
      'text_tokens', 'image_inputs', 'image_outputs', 'audio_tokens', 'audio_seconds',
      'speech_seconds', 'transcription_seconds', 'video_tokens', 'video_seconds',
      'cached_tokens', 'embedding_tokens', 'rerank_quad_tokens', 'tool_calls', 'users'
    ) then
    raise exception 'Invalid ranking metric or period';
  end if;

  return query
  with periods as (
    select true as is_current, p_as_of - p_days * interval '24 hours' as start_at, p_as_of as end_at
    union all
    select false, p_as_of - 2 * p_days * interval '24 hours', p_as_of - p_days * interval '24 hours'
  ), windows as (
    select p.*,
      (p.start_at at time zone 'UTC')::date + case
        when (p.start_at at time zone 'UTC')::time = time '00:00' then 0 else 1 end as full_from,
      (p.end_at at time zone 'UTC')::date as full_to
    from periods p
  ), edges as materialized (
    select w.is_current, w.start_at, least(w.full_from::timestamp at time zone 'UTC', w.end_at) as end_at
    from windows w where w.start_at < (w.full_from::timestamp at time zone 'UTC')
    union all
    select w.is_current, greatest(w.full_to::timestamp at time zone 'UTC', w.start_at), w.end_at
    from windows w where (w.full_to::timestamp at time zone 'UTC') < w.end_at
  ), quantities as (
    select w.is_current, u.model_id, case when p_metric = 'tool_calls' then u.tool_call_count::numeric
      else public.public_ranking_metric_value(p_metric, u.meters) end as value
    from windows w
    cross join lateral public.get_public_ranking_usage_window(w.start_at, w.end_at) u
    where p_metric <> 'users'
  ), actors as (
    select w.is_current, d.model_id, d.actor_hash
    from windows w
    join public.public_model_user_usage_daily d on d.day_bucket >= w.full_from and d.day_bucket < w.full_to
    where p_metric = 'users'
    union all
    -- Match the actor identity and model normalization used by the daily user rollup.
    select e.is_current,
      public.public_leaderboard_model_id(gr.canonical_model_id, gr.model_id, gr.requested_model_id,
        gr.routed_model_id, authoritative.api_model_id, gr.provider, authoritative.pricing_plan, authoritative.is_free_variant),
      md5('public-model-user:' || coalesce(
        nullif(to_jsonb(gr)->>'oauth_user_id', ''), nullif(to_jsonb(gr)->>'end_user_id', ''),
        nullif(to_jsonb(gr)->>'workspace_id', ''), nullif(to_jsonb(gr)->>'team_id', ''), nullif(to_jsonb(gr)->>'key_id', '')
      ))
    from edges e
    join public.v2_rpc_gateway_requests_legacy_shape gr on gr.created_at >= e.start_at and gr.created_at < e.end_at
    left join public.v2_request_facts fact on fact.request_event_id = gr.id
    left join public.gateway_requests authoritative on authoritative.id = fact.gateway_request_id
      and authoritative.created_at = fact.gateway_request_created_at
    where p_metric = 'users' and gr.success is true
  ), totals as (
    select q.model_id, coalesce(sum(q.value) filter (where q.is_current), 0) as current,
      coalesce(sum(q.value) filter (where not q.is_current), 0) as previous
    from quantities q group by q.model_id
    union all
    select a.model_id, count(distinct a.actor_hash) filter (where a.is_current)::numeric,
      count(distinct a.actor_hash) filter (where not a.is_current)::numeric
    from actors a group by a.model_id
  )
  select t.model_id, t.current, t.previous
  from totals t
  join public.v2_models m on m.model_slug = t.model_id and m.hidden = false and m.status <> 'disabled'
  where lower(t.model_id) not in ('unknown', 'other') and (t.current > 0 or t.previous > 0)
  order by t.current desc, t.model_id
  limit 500;
end;
$$;
revoke all on function public.get_public_period_leaderboard(text, integer, timestamptz) from public;
grant execute on function public.get_public_period_leaderboard(text, integer, timestamptz) to service_role;
notify pgrst, 'reload schema';

-- Decisions get their own public ranking (/rankings/decisions).
-- * decision_tokens: a workload meter the gateway writes for /v1/decisions requests
--   (their text tokens). Text rankings, market share and top apps subtract it;
--   the Decisions page ranks by it.
-- * Decision-only models are left out of the text page's Fastest Models and
--   Unique Users sections.
-- * Backfills decision_tokens for past /v1/decisions requests so history moves too.
--   Inserts only; the existing analytics trigger re-queues the affected rollups.

CREATE OR REPLACE FUNCTION public.public_decision_only_models ()
  RETURNS TABLE (
    model_slug text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  -- Models that only answer /v1/decisions. They are ranked on the Decisions
  -- page, so per-model text rankings leave them out. Models that also serve
  -- text generation stay in the text rankings.
  select route.model_slug
  from public.v2_route_capabilities capability
  join public.v2_model_provider_routes route on route.provider_model_id = capability.provider_model_id
  group by route.model_slug
  having bool_or(capability.capability_id = 'decisions.make')
    and bool_and(capability.capability_id in ('decisions.make', 'batch'));
$function$;

REVOKE ALL ON FUNCTION "public"."public_decision_only_models"() FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."public_decision_only_models"() TO "service_role";

create or replace function public.public_ranking_metric_value(p_metric text, meters jsonb)
returns numeric
language sql immutable security invoker set search_path = ''
as $$
  select case p_metric
    -- Market share and top apps sit on the text page, so they leave decision tokens out too.
    when 'tokens' then greatest(coalesce((meters->>'total_tokens')::numeric,
      case when meters ? 'input_tokens' or meters ? 'output_tokens'
        then coalesce((meters->>'input_tokens')::numeric, 0) + coalesce((meters->>'output_tokens')::numeric, 0)
        else coalesce((meters->>'input_text_tokens')::numeric, 0) + coalesce((meters->>'output_text_tokens')::numeric, 0) end)
      - coalesce((meters->>'decision_tokens')::numeric, 0), 0)
    -- Decisions have their own ranking; keep them out of text volume.
    when 'text_tokens' then greatest(coalesce((meters->>'input_text_tokens')::numeric, 0) + coalesce((meters->>'output_text_tokens')::numeric, 0)
      - coalesce((meters->>'decision_tokens')::numeric, 0), 0)
    when 'decision_tokens' then coalesce((meters->>'decision_tokens')::numeric, 0)
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

CREATE OR REPLACE VIEW "public"."v2_rpc_gateway_model_usage_daily" WITH (security_invoker=true) AS  SELECT usage.usage_date AS day_bucket,
    usage.model_slug AS model_id,
    route.provider_slug AS provider_id,
    'unknown'::text AS endpoint,
    usage.requests,
    usage.successful_requests AS success_requests,
    usage.failed_requests,
    (0)::bigint AS neutral_requests,
    usage.rate_limited_requests,
    (COALESCE(((meters."values" ->> 'total_tokens'::text))::numeric, (((meters."values" ->> 'input_tokens'::text))::numeric + ((meters."values" ->> 'output_tokens'::text))::numeric), (((meters."values" ->> 'input_text_tokens'::text))::numeric + ((meters."values" ->> 'output_text_tokens'::text))::numeric), (0)::numeric))::bigint AS total_tokens,
    (COALESCE(((meters."values" ->> 'input_tokens'::text))::numeric, ((meters."values" ->> 'input_text_tokens'::text))::numeric, (0)::numeric))::bigint AS input_tokens,
    (COALESCE(((meters."values" ->> 'output_tokens'::text))::numeric, ((meters."values" ->> 'output_text_tokens'::text))::numeric, (0)::numeric))::bigint AS output_tokens,
    (COALESCE(((meters."values" ->> 'reasoning_tokens'::text))::numeric, (0)::numeric))::bigint AS reasoning_tokens,
    (COALESCE(((meters."values" ->> 'input_text_tokens'::text))::numeric, (0)::numeric))::bigint AS input_text_tokens,
    (COALESCE(((meters."values" ->> 'output_text_tokens'::text))::numeric, (0)::numeric))::bigint AS output_text_tokens,
    (COALESCE(((meters."values" ->> 'input_image_tokens'::text))::numeric, (0)::numeric))::bigint AS input_image_tokens,
    (COALESCE(((meters."values" ->> 'output_image_tokens'::text))::numeric, (0)::numeric))::bigint AS output_image_tokens,
    (COALESCE(((meters."values" ->> 'input_audio_tokens'::text))::numeric, (0)::numeric))::bigint AS input_audio_tokens,
    (COALESCE(((meters."values" ->> 'output_audio_tokens'::text))::numeric, (0)::numeric))::bigint AS output_audio_tokens,
    (COALESCE(((meters."values" ->> 'input_video_tokens'::text))::numeric, (0)::numeric))::bigint AS input_video_tokens,
    (COALESCE(((meters."values" ->> 'output_video_tokens'::text))::numeric, (0)::numeric))::bigint AS output_video_tokens,
    (COALESCE(((meters."values" ->> 'image_inputs'::text))::numeric, ((meters."values" ->> 'input_images'::text))::numeric, (0)::numeric))::bigint AS image_inputs,
    (COALESCE(((meters."values" ->> 'image_outputs'::text))::numeric, ((meters."values" ->> 'output_images'::text))::numeric, (0)::numeric))::bigint AS image_outputs,
    (COALESCE(((meters."values" ->> 'audio_inputs'::text))::numeric, ((meters."values" ->> 'input_audio'::text))::numeric, (0)::numeric))::bigint AS audio_inputs,
    (COALESCE(((meters."values" ->> 'audio_outputs'::text))::numeric, ((meters."values" ->> 'output_audio'::text))::numeric, (0)::numeric))::bigint AS audio_outputs,
    (COALESCE(((meters."values" ->> 'video_inputs'::text))::numeric, ((meters."values" ->> 'input_video'::text))::numeric, (0)::numeric))::bigint AS video_inputs,
    (COALESCE(((meters."values" ->> 'video_outputs'::text))::numeric, ((meters."values" ->> 'output_video'::text))::numeric, (0)::numeric))::bigint AS video_outputs,
    (COALESCE(((meters."values" ->> 'cached_read_tokens'::text))::numeric, ((meters."values" ->> 'cached_input_tokens'::text))::numeric, (0)::numeric))::bigint AS cached_read_tokens,
    (COALESCE(((meters."values" ->> 'cached_write_tokens'::text))::numeric, ((meters."values" ->> 'cache_write_tokens'::text))::numeric, (0)::numeric))::bigint AS cached_write_tokens,
    (COALESCE(((meters."values" ->> 'cached_read_text_tokens'::text))::numeric, (0)::numeric))::bigint AS cached_read_text_tokens,
    (COALESCE(((meters."values" ->> 'cached_write_text_tokens'::text))::numeric, (0)::numeric))::bigint AS cached_write_text_tokens,
    (COALESCE(((meters."values" ->> 'cached_read_image_tokens'::text))::numeric, (0)::numeric))::bigint AS cached_read_image_tokens,
    (COALESCE(((meters."values" ->> 'cached_write_image_tokens'::text))::numeric, (0)::numeric))::bigint AS cached_write_image_tokens,
    (COALESCE(((meters."values" ->> 'cached_read_audio_tokens'::text))::numeric, (0)::numeric))::bigint AS cached_read_audio_tokens,
    (COALESCE(((meters."values" ->> 'cached_write_audio_tokens'::text))::numeric, (0)::numeric))::bigint AS cached_write_audio_tokens,
    (COALESCE(((meters."values" ->> 'cached_read_video_tokens'::text))::numeric, (0)::numeric))::bigint AS cached_read_video_tokens,
    (COALESCE(((meters."values" ->> 'cached_write_video_tokens'::text))::numeric, (0)::numeric))::bigint AS cached_write_video_tokens,
    (0)::bigint AS total_cost_nanos,
    usage.latency_sum_ms,
    usage.latency_count AS latency_samples,
    usage.generation_sum_ms,
    usage.generation_count AS generation_samples,
    usage.throughput_sum,
    usage.throughput_count AS throughput_samples,
    usage.updated_at AS last_request_at,
    usage.updated_at AS refreshed_at,
    (COALESCE(((meters."values" ->> 'input_quad_tokens'::text))::numeric, (0)::numeric))::bigint AS input_quad_tokens,
    (COALESCE(((meters."values" ->> 'output_quad_tokens'::text))::numeric, (0)::numeric))::bigint AS output_quad_tokens,
    (COALESCE(((meters."values" ->> 'total_quad_tokens'::text))::numeric, (0)::numeric))::bigint AS total_quad_tokens,
    (COALESCE(((meters."values" ->> 'cached_write_text_tokens_5m'::text))::numeric, (0)::numeric))::bigint AS cached_write_text_tokens_5m,
    (COALESCE(((meters."values" ->> 'cached_write_text_tokens_1h'::text))::numeric, (0)::numeric))::bigint AS cached_write_text_tokens_1h,
    (COALESCE(((meters."values" ->> 'text_quad_tokens'::text))::numeric, (0)::numeric))::bigint AS text_quad_tokens,
    (COALESCE(((meters."values" ->> 'rerank_quad_tokens'::text))::numeric, (0)::numeric))::bigint AS rerank_quad_tokens,
    (COALESCE(((meters."values" ->> 'embedding_quad_tokens'::text))::numeric, (0)::numeric))::bigint AS embedding_quad_tokens,
    (COALESCE(((meters."values" ->> 'moderation_quad_tokens'::text))::numeric, (0)::numeric))::bigint AS moderation_quad_tokens,
    (COALESCE(((meters."values" ->> 'ocr_quad_tokens'::text))::numeric, (0)::numeric))::bigint AS ocr_quad_tokens,
    COALESCE(((meters."values" ->> 'image_megapixels'::text))::numeric, (0)::numeric) AS image_megapixels,
    COALESCE(((meters."values" ->> 'audio_seconds'::text))::numeric, (0)::numeric) AS audio_seconds,
    COALESCE(((meters."values" ->> 'video_pixel_seconds'::text))::numeric, (0)::numeric) AS video_pixel_seconds,
    (COALESCE(((meters."values" ->> 'input_characters'::text))::numeric, (0)::numeric))::bigint AS input_characters,
    (COALESCE(((meters."values" ->> 'output_characters'::text))::numeric, (0)::numeric))::bigint AS output_characters,
    (COALESCE(((meters."values" ->> 'total_characters'::text))::numeric, (0)::numeric))::bigint AS total_characters,
    (COALESCE(((meters."values" ->> 'embedding_tokens'::text))::numeric, (0)::numeric))::bigint AS embedding_tokens,
    COALESCE(((meters."values" ->> 'video_seconds'::text))::numeric, ((meters."values" ->> 'output_video_seconds'::text))::numeric, (0)::numeric) AS video_seconds,
    COALESCE(((meters."values" ->> 'speech_seconds'::text))::numeric, (0)::numeric) AS speech_seconds,
    COALESCE(((meters."values" ->> 'transcription_seconds'::text))::numeric, (0)::numeric) AS transcription_seconds,
    (COALESCE(((meters."values" ->> 'decision_tokens'::text))::numeric, (0)::numeric))::bigint AS decision_tokens
   FROM (((public.reporting_usage_daily usage
     JOIN public.v2_model_provider_routes route ON (((route.provider_model_id = usage.provider_model_id) AND (COALESCE(route.is_stealth, false) = false) AND (route.routing_enabled = true) AND (route.status = ANY (ARRAY['active'::text, 'degraded'::text])) AND ((route.effective_from IS NULL) OR (route.effective_from <= now())) AND ((route.effective_to IS NULL) OR (route.effective_to > now())))))
     JOIN public.v2_models model ON (((model.model_slug = usage.model_slug) AND (model.hidden = false) AND (model.status <> 'disabled'::text))))
     LEFT JOIN LATERAL ( SELECT jsonb_object_agg(meter.meter_key, meter.quantity) AS "values"
           FROM ( SELECT v2_public_usage_daily_meters.meter_key,
                    sum(v2_public_usage_daily_meters.quantity) AS quantity
                   FROM public.v2_public_usage_daily_meters
                  WHERE (v2_public_usage_daily_meters.rollup_id = usage.rollup_id)
                  GROUP BY v2_public_usage_daily_meters.meter_key) meter) meters ON (true));

CREATE OR REPLACE FUNCTION public.get_public_modality_usage_timeseries (
  p_metric     text,
  p_time_range text    DEFAULT 'year'::text,
  p_top_n      integer DEFAULT 20
)
  RETURNS TABLE (
    bucket   timestamp with time zone,
    model_id text,
    requests bigint,
    tokens   numeric,
    colour   text
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  v_since date;
begin
  case p_time_range
    when '24h' then v_since := (now() at time zone 'utc')::date - 1;
    when 'today' then v_since := (now() at time zone 'utc')::date;
    when 'week' then v_since := (now() at time zone 'utc')::date - 7;
    when 'month' then v_since := (now() at time zone 'utc')::date - 30;
    when 'year' then v_since := (now() at time zone 'utc')::date - 365;
    else v_since := (now() at time zone 'utc')::date - 365;
  end case;

  return query
  with daily as (
    select
      (date_trunc('week', d.day_bucket::timestamp) at time zone 'UTC') as time_bucket,
      d.model_id,
      sum(d.requests)::bigint as req_count,
      sum(
        case p_metric
          -- Decisions have their own ranking; keep them out of text volume.
          when 'text_tokens' then greatest(d.input_text_tokens + d.output_text_tokens - d.decision_tokens, 0)
          when 'decision_tokens' then d.decision_tokens
          when 'image_inputs' then d.image_inputs
          when 'image_outputs' then d.image_outputs
          when 'audio_tokens' then d.input_audio_tokens + d.output_audio_tokens
          when 'audio_seconds' then d.audio_seconds
          when 'speech_seconds' then d.speech_seconds
          when 'transcription_seconds' then d.transcription_seconds
          when 'video_tokens' then d.input_video_tokens + d.output_video_tokens
          when 'video_seconds' then d.video_seconds
          when 'cached_tokens' then d.cached_read_tokens + d.cached_write_tokens
          when 'embedding_tokens' then d.embedding_tokens
          when 'rerank_quad_tokens' then d.rerank_quad_tokens
          else 0
        end
      )::numeric as metric_value
    from public.v2_rpc_gateway_model_usage_daily d
    where d.day_bucket >= v_since
    group by 1, 2
  ),
  ranked_daily as (
    select
      d.*,
      row_number() over (
        partition by d.time_bucket
        order by d.metric_value desc, d.req_count desc, d.model_id
      ) as bucket_rank
    from daily d
    where lower(d.model_id) not in ('unknown', 'other')
      and d.metric_value > 0
  ),
  bucketed as (
    select
      d.time_bucket,
      case
        when rd.bucket_rank <= greatest(1, least(coalesce(p_top_n, 20), 100)) then d.model_id
        else 'Other'
      end as model_group,
      sum(d.req_count)::bigint as req_count,
      sum(d.metric_value)::numeric as metric_value
    from daily d
    left join ranked_daily rd
      on rd.time_bucket = d.time_bucket
      and rd.model_id = d.model_id
    where d.metric_value > 0
      and lower(d.model_id) <> 'unknown'
    group by d.time_bucket, model_group
  )
  select
    b.time_bucket as bucket,
    b.model_group as model_id,
    b.req_count as requests,
    b.metric_value as tokens,
    case
      when b.model_group = 'Other' then null
      else org.colour
    end as colour
  from bucketed b
  left join public.v2_models dm on dm.model_slug = b.model_group
  left join public.v2_labs org on dm.lab_slug = org.lab_slug
  order by b.time_bucket, b.metric_value desc;
end;
$function$;

create or replace function public.get_public_period_leaderboard(
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
      'cached_tokens', 'embedding_tokens', 'rerank_quad_tokens', 'decision_tokens', 'tool_calls', 'users'
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
    join public.reporting_model_user_usage_daily d on d.day_bucket >= w.full_from and d.day_bucket < w.full_to
    where p_metric = 'users'
    union all
    -- Match the actor identity and model normalization used by the daily user rollup.
    select e.is_current,
      public.public_leaderboard_model_id(
        coalesce(fact.routed_model_slug, fact.requested_model_slug),
        coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input),
        fact.requested_model_input, fact.routed_model_slug, authoritative.api_model_id,
        route.provider_slug, authoritative.pricing_plan, authoritative.is_free_variant),
      md5('public-model-user:' || coalesce(
        nullif(fact.safe_metadata->>'oauth_user_id', '')::uuid::text,
        nullif(fact.end_user_id, ''), fact.workspace_id::text, fact.key_id::text
      ))
    from edges e
    join public.reporting_request_facts fact on fact.occurred_at >= e.start_at and fact.occurred_at < e.end_at
    left join public.v2_model_provider_routes route on route.provider_model_id = fact.provider_model_id
    left join public.gateway_requests authoritative on authoritative.id = fact.gateway_request_id
      and authoritative.created_at = fact.gateway_request_created_at
    where p_metric = 'users' and fact.success is true
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

CREATE OR REPLACE FUNCTION public.get_public_fastest_models (
  p_days  integer DEFAULT 30,
  p_limit integer DEFAULT 20
)
  RETURNS TABLE (
    model_id           text,
    provider           text,
    requests           bigint,
    cost_per_1m_tokens numeric,
    median_latency_ms  numeric,
    p95_latency_ms     numeric,
    median_throughput  numeric,
    success_rate       numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select performance.*
  from public.get_public_model_performance(
    greatest(1, least(coalesce(p_days, 30), 365)) * 24,
    0
  ) performance
  where (performance.median_throughput is not null
     or performance.median_latency_ms is not null)
    -- Decision-only models are ranked on the Decisions page.
    and performance.model_id not in (select decision.model_slug from public.public_decision_only_models() decision)
  order by performance.requests desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$function$;

CREATE OR REPLACE FUNCTION public.get_public_unique_user_timeseries (
  p_time_range  text    DEFAULT 'year'::text,
  p_bucket_size text    DEFAULT 'week'::text,
  p_top_n       integer DEFAULT 10
)
  RETURNS TABLE (
    bucket   timestamp with time zone,
    model_id text,
    requests bigint,
    tokens   bigint,
    users    bigint,
    colour   text
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
#variable_conflict use_column
declare
  v_since date;
begin
  case p_time_range
    when '24h' then v_since := (now() at time zone 'utc')::date - 1;
    when 'today' then v_since := (now() at time zone 'utc')::date;
    when 'week' then v_since := (now() at time zone 'utc')::date - 7;
    when 'month' then v_since := (now() at time zone 'utc')::date - 30;
    when 'year' then v_since := (now() at time zone 'utc')::date - 365;
    else v_since := (now() at time zone 'utc')::date - 365;
  end case;

  return query
  with actor_rows as (
    select
      case
        when p_bucket_size = 'month' then date_trunc('month', d.day_bucket::timestamp)::timestamptz
        when p_bucket_size = 'day' then d.day_bucket::timestamptz
        else date_trunc('week', d.day_bucket::timestamp)::timestamptz
      end as time_bucket,
      d.model_id,
      d.actor_hash,
      sum(d.requests)::bigint as req_count,
      sum(d.tokens)::bigint as tok_count
    from public.reporting_model_user_usage_daily d
    where d.day_bucket >= v_since
      and lower(d.model_id) not in ('unknown', 'other')
      -- Decision-only models are ranked on the Decisions page.
      and d.model_id not in (select decision.model_slug from public.public_decision_only_models() decision)
    group by 1, 2, 3
  ),
  base as (
    select
      ar.time_bucket,
      ar.model_id,
      sum(ar.req_count)::bigint as req_count,
      sum(ar.tok_count)::bigint as tok_count,
      count(distinct ar.actor_hash)::bigint as user_count
    from actor_rows ar
    group by ar.time_bucket, ar.model_id
  ),
  ranked_base as (
    select
      b.*,
      row_number() over (
        partition by b.time_bucket
        order by b.user_count desc, b.tok_count desc, b.req_count desc, b.model_id
      ) as bucket_rank
    from base b
    where b.user_count > 0
  ),
  bucketed as (
    select
      ar.time_bucket,
      case
        when rb.bucket_rank <= greatest(p_top_n, 1) then ar.model_id
        else 'Other'
      end as model_group,
      sum(ar.req_count)::bigint as req_count,
      sum(ar.tok_count)::bigint as tok_count,
      count(distinct ar.actor_hash)::bigint as user_count
    from actor_rows ar
    left join ranked_base rb
      on rb.time_bucket = ar.time_bucket
      and rb.model_id = ar.model_id
    group by ar.time_bucket, model_group
  )
  select
    b.time_bucket as bucket,
    b.model_group as model_id,
    b.req_count as requests,
    b.tok_count as tokens,
    b.user_count as users,
    case
      when b.model_group = 'Other' then null
      else org.colour
    end as colour
  from bucketed b
  left join private.v2_rpc_models_compat dm on dm.model_id = b.model_group
  left join private.v2_rpc_labs_compat org on dm.organisation_id = org.organisation_id
  where b.user_count > 0
  order by b.time_bucket, b.user_count desc, b.tok_count desc;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_market_share_timeseries (
  p_dimension   text    DEFAULT 'organization'::text,
  p_time_range  text    DEFAULT 'year'::text,
  p_bucket_size text    DEFAULT 'week'::text,
  p_top_n       integer DEFAULT 8
)
  RETURNS TABLE (
    bucket   timestamp with time zone,
    name     text,
    requests bigint,
    tokens   bigint,
    colour   text
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  v_since timestamptz;
  v_dimension text := lower(coalesce(p_dimension, 'provider'));
  v_bucket_size text := lower(coalesce(p_bucket_size, 'day'));
begin
  case lower(coalesce(p_time_range, 'week'))
    when '24h' then v_since := now() - interval '24 hours';
    when 'today' then v_since := date_trunc('day', now());
    when 'week' then v_since := now() - interval '7 days';
    when 'month' then v_since := now() - interval '30 days';
    when 'year' then v_since := now() - interval '1 year';
    else v_since := now() - interval '1 year';
  end case;

  return query
  with source_rows as (
    select
      case
        when v_bucket_size = 'hour' then date_trunc('hour', usage.bucket_15m)
        when v_bucket_size = 'day' then date_trunc('day', usage.bucket_15m)
        when v_bucket_size = 'month' then date_trunc('month', usage.bucket_15m)
        else date_trunc('week', usage.bucket_15m)
      end as time_bucket,
      usage.canonical_model_id as model_slug,
      usage.provider,
      usage.requests,
      usage.total_tokens
    from (
with meters as (
  select
    meter.rollup_id,
    -- Decisions have their own ranking; keep their tokens out of market share.
    greatest(coalesce(
      max(meter.quantity) filter (where meter.meter_key = 'total_tokens'),
      sum(meter.quantity) filter (where meter.meter_key in ('input_tokens', 'output_tokens')),
      sum(meter.quantity) filter (where meter.meter_key in ('input_text_tokens', 'output_text_tokens')),
      0
    ) - coalesce(sum(meter.quantity) filter (where meter.meter_key = 'decision_tokens'), 0), 0)::numeric as total_tokens
  from public.v2_public_usage_hourly_meters meter
  join public.reporting_usage_hourly scoped on scoped.rollup_id = meter.rollup_id
  where v_bucket_size = 'hour' and scoped.bucket_start >= v_since
  group by meter.rollup_id
)
select
  usage.bucket_start as bucket_15m,
  usage.model_slug as canonical_model_id,
  route.provider_slug as provider,
  usage.app_id,
  usage.requests,
  usage.successful_requests as success_requests,
  coalesce(meters.total_tokens, 0) as total_tokens,
  usage.cost_nanos::bigint as total_cost_nanos,
  usage.latency_sum_ms,
  usage.latency_count as latency_samples,
  usage.throughput_sum,
  usage.throughput_count as throughput_samples,
  usage.generation_sum_ms,
  usage.generation_count as generation_samples
from public.reporting_usage_hourly usage
join public.v2_model_provider_routes route
  on route.provider_model_id = usage.provider_model_id
  and coalesce(route.is_stealth, false) = false
  and route.routing_enabled = true
  and route.status in ('active', 'degraded')
  and (route.effective_from is null or route.effective_from <= now())
  and (route.effective_to is null or route.effective_to > now())
join public.v2_models model
  on model.model_slug = usage.model_slug
  and model.hidden = false
  and model.status <> 'disabled'
left join meters on meters.rollup_id = usage.rollup_id
) usage
    where v_bucket_size = 'hour'
      and usage.bucket_15m >= v_since

    union all

    select
      case
        when v_bucket_size = 'day' then usage.day_bucket::timestamptz
        when v_bucket_size = 'month' then date_trunc('month', usage.day_bucket::timestamp)::timestamptz
        else date_trunc('week', usage.day_bucket::timestamp)::timestamptz
      end as time_bucket,
      usage.canonical_model_id as model_slug,
      usage.provider,
      usage.requests,
      usage.total_tokens
    from (
with meters as (
  select
    meter.rollup_id,
    -- Decisions have their own ranking; keep their tokens out of market share.
    greatest(coalesce(
      max(meter.quantity) filter (where meter.meter_key = 'total_tokens'),
      sum(meter.quantity) filter (where meter.meter_key in ('input_tokens', 'output_tokens')),
      sum(meter.quantity) filter (where meter.meter_key in ('input_text_tokens', 'output_text_tokens')),
      0
    ) - coalesce(sum(meter.quantity) filter (where meter.meter_key = 'decision_tokens'), 0), 0)::numeric as total_tokens
  from public.v2_public_usage_daily_meters meter
  join public.reporting_usage_daily scoped on scoped.rollup_id = meter.rollup_id
  where v_bucket_size <> 'hour' and scoped.usage_date >= (v_since at time zone 'utc')::date
  group by meter.rollup_id
)
select
  usage.usage_date as day_bucket,
  usage.model_slug as canonical_model_id,
  route.provider_slug as provider,
  usage.app_id,
  usage.requests,
  usage.successful_requests as success_requests,
  coalesce(meters.total_tokens, 0) as total_tokens,
  usage.cost_nanos::bigint as total_cost_nanos,
  usage.latency_sum_ms,
  usage.latency_count as latency_samples,
  usage.throughput_sum,
  usage.throughput_count as throughput_samples,
  usage.generation_sum_ms,
  usage.generation_count as generation_samples
from public.reporting_usage_daily usage
join public.v2_model_provider_routes route
  on route.provider_model_id = usage.provider_model_id
  and coalesce(route.is_stealth, false) = false
  and route.routing_enabled = true
  and route.status in ('active', 'degraded')
  and (route.effective_from is null or route.effective_from <= now())
  and (route.effective_to is null or route.effective_to > now())
join public.v2_models model
  on model.model_slug = usage.model_slug
  and model.hidden = false
  and model.status <> 'disabled'
left join meters on meters.rollup_id = usage.rollup_id
) usage
    where v_bucket_size <> 'hour'
      and usage.day_bucket >= (v_since at time zone 'utc')::date
  ),
  grouped as (
    select
      source.time_bucket,
      case
        when v_dimension = 'organization' then coalesce(nullif(lab.name, ''), nullif(model.lab_slug, ''), 'Unknown')
        else source.provider
      end as group_name,
      sum(source.requests)::bigint as request_count,
      sum(source.total_tokens)::bigint as token_count,
      case
        when v_dimension = 'organization' then max(lab.metadata ->> 'colour')
        else max(provider.metadata ->> 'colour')
      end as group_colour
    from source_rows source
    left join public.v2_models model on model.model_slug = source.model_slug
    left join public.v2_labs lab on lab.lab_slug = model.lab_slug
    left join public.v2_providers provider on provider.provider_slug = source.provider
    where (
      v_dimension = 'organization'
      and model.lab_slug is not null
    ) or (
      v_dimension <> 'organization'
      and source.provider is not null
      and source.provider <> ''
    )
    group by source.time_bucket, group_name
  ),
  top_groups as (
    select grouped.group_name
    from grouped
    group by grouped.group_name
    order by sum(grouped.request_count) desc, grouped.group_name
    limit greatest(coalesce(p_top_n, 8), 1)
  ),
  bucketed as (
    select
      grouped.time_bucket,
      case
        when grouped.group_name in (select top_groups.group_name from top_groups) then grouped.group_name
        else 'Other'
      end as group_name,
      sum(grouped.request_count)::bigint as request_count,
      sum(grouped.token_count)::bigint as token_count,
      max(case
        when grouped.group_name in (select top_groups.group_name from top_groups) then grouped.group_colour
        else null
      end) as group_colour
    from grouped
    group by grouped.time_bucket, group_name
  )
  select
    bucketed.time_bucket as bucket,
    bucketed.group_name as name,
    bucketed.request_count as requests,
    bucketed.token_count as tokens,
    bucketed.group_colour as colour
  from bucketed
  order by bucketed.time_bucket, bucketed.request_count desc;
end;
$function$;

insert into public.v2_request_usage (
  request_event_id, meter_key, modality, unit, quantity, source, billable, sequence
)
select tokens.request_event_id, 'decision_tokens', 'text', 'tokens', tokens.quantity, 'gateway', false, 0
from (
  select fact.request_event_id, sum(usage.quantity) as quantity
  from public.gateway_requests request
  join public.v2_request_facts fact
    on fact.gateway_request_id = request.id
    and fact.gateway_request_created_at = request.created_at
  join public.v2_request_usage usage
    on usage.request_event_id = fact.request_event_id
    and usage.meter_key in ('input_text_tokens', 'output_text_tokens')
  where request.endpoint = 'decisions'
  group by fact.request_event_id
) tokens
where tokens.quantity > 0
on conflict (request_event_id, meter_key, sequence) do nothing;

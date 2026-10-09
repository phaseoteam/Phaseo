CREATE OR REPLACE FUNCTION public.get_model_token_trajectory(p_model_id text)
 RETURNS TABLE(release_date timestamp with time zone, deprecation_date timestamp with time zone, points jsonb, token_milestones jsonb, successor_milestones jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$with model_row as (
  select model_id, release_date, deprecation_date
  from private.v2_rpc_models_compat
  where model_id = p_model_id
  limit 1
),

-- Build the set of gateway_requests.model_id values to include
model_ids as (
  select p_model_id as model_id
  union
  select
    pm.provider_id || '/' || regexp_replace(pm.api_model_id, '^' || pm.provider_id || '/', '')
  from private.v2_rpc_routes_compat pm
  where pm.internal_model_id = p_model_id
),

anchors as (
  select
    mr.release_date,
    mr.deprecation_date,
    -- choose today's UTC day (not "greatest" vs release day; that could invert the range)
    date_trunc('day', now() at time zone 'utc') as today,
    date_trunc('day', mr.release_date) as start_day
  from model_row mr
),

-- Days after the release day come from daily usage rollups, which carry the
-- same token meters as raw request usage keyed by coalesce(routed, requested)
-- model slug. Facts without either slug are failed requests with no usage.
-- The release day itself is read from facts to keep the exact release-time
-- cutoff. Usage meters come from priced SKU meters, none of which is
-- total_tokens, so per-grain and per-request fallbacks agree.
release_day as (
  select (mr.release_date at time zone 'utc')::date as day,
    ((mr.release_date at time zone 'utc')::date + 1)::timestamp at time zone 'utc' as next_day_start
  from model_row mr
  where mr.release_date is not null
),

daily_tokens as (
  select grain.usage_date::timestamp as day,
    sum(coalesce(nullif(grain.explicit_total, 0),
      coalesce(grain.input_tokens, 0) + coalesce(grain.output_tokens, 0))) as tokens
  from (
    select rollup.usage_date,
      sum(meter.quantity) filter (where meter.meter_key = 'total_tokens') as explicit_total,
      sum(meter.quantity) filter (where meter.meter_key = 'input_tokens') as input_tokens,
      sum(meter.quantity) filter (where meter.meter_key = 'output_tokens') as output_tokens
    from public.v2_public_usage_daily rollup
    cross join release_day rd
    join public.v2_public_usage_daily_meters meter
      on meter.rollup_id = rollup.rollup_id
     and meter.meter_key in ('total_tokens', 'input_tokens', 'output_tokens')
    where rollup.model_slug in (select model_id from model_ids)
      and rollup.usage_date > rd.day
    group by rollup.rollup_id, rollup.usage_date
  ) grain
  group by 1
  union all
  select date_trunc('day', fact.occurred_at at time zone 'utc') as day,
    sum(coalesce(nullif(tokens.explicit_total, 0),
      coalesce(tokens.input_tokens, 0) + coalesce(tokens.output_tokens, 0))) as tokens
  from public.reporting_request_facts fact
  cross join model_row mr
  cross join release_day rd
  left join lateral (
    select sum(usage.quantity) filter (where usage.meter_key = 'total_tokens') as explicit_total,
      sum(usage.quantity) filter (where usage.meter_key = 'input_tokens') as input_tokens,
      sum(usage.quantity) filter (where usage.meter_key = 'output_tokens') as output_tokens
    from public.v2_request_usage usage
    where usage.request_event_id = fact.request_event_id
      and usage.meter_key in ('total_tokens', 'input_tokens', 'output_tokens')
  ) tokens on true
  where coalesce(fact.routed_model_slug, fact.requested_model_slug, fact.requested_model_input)
      in (select model_id from model_ids)
    and fact.occurred_at >= mr.release_date
    and fact.occurred_at < rd.next_day_start
  group by 1
),

point_series as (
  select
    gs.day,
    coalesce(dt.tokens, 0) as tokens,
    sum(coalesce(dt.tokens, 0)) over (order by gs.day) as cumulative_tokens,
    floor(extract(epoch from (gs.day - (select release_date from model_row))) / 86400)::int as days_since_release
  from (
    select generate_series(
      (select start_day from anchors),
      (select today from anchors),
      interval '1 day'
    ) as day
  ) gs
  left join daily_tokens dt on dt.day = gs.day
),

points_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(day, 'YYYY-MM-DD"T"00:00:00.000Z'),
        'tokens', tokens,
        'cumulativeTokens', cumulative_tokens,
        'daysSinceRelease', days_since_release
      )
      order by day
    ),
    '[]'::jsonb
  ) as value
  from point_series
),

milestones as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'threshold', threshold,
        'reachedOn', reached_on,
        'daysSinceRelease', days_since_release
      )
      order by threshold
    ),
    '[]'::jsonb
  ) as value
  from (
    select
      threshold,
      (select to_char(ps.day, 'YYYY-MM-DD"T"00:00:00.000Z')
       from point_series ps
       where ps.cumulative_tokens >= threshold
       order by ps.day asc
       limit 1) as reached_on,
      (select ps.days_since_release
       from point_series ps
       where ps.cumulative_tokens >= threshold
       order by ps.day asc
       limit 1) as days_since_release
    from unnest(array[1000000, 10000000, 100000000, 1000000000]) as threshold
  ) m
),

successors as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'modelId', dm.model_id,
        'name', coalesce(dm.name, dm.model_id),
        'releaseDate', dm.release_date,
        'daysSinceRelease',
          case
            when mr.release_date is null or dm.release_date is null then null
            else floor(extract(epoch from (dm.release_date - mr.release_date)) / 86400)::int
          end
      )
    ),
    '[]'::jsonb
  ) as value
  from private.v2_rpc_models_compat dm
  cross join model_row mr
  where dm.previous_model_id = p_model_id
)

select
  (select release_date from model_row) as release_date,
  (select deprecation_date from model_row) as deprecation_date,
  (select value from points_json) as points,
  (select value from milestones) as token_milestones,
  (select value from successors) as successor_milestones
where (select release_date from model_row) is not null;$function$;

GRANT EXECUTE ON FUNCTION "public"."get_model_token_trajectory"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_model_token_trajectory"(text) TO "service_role";

COMMENT ON FUNCTION "public"."get_model_token_trajectory"(text) IS 'Returns token trajectory (daily totals & cumulative), milestones, and successor milestones for a model.';

REVOKE ALL ON FUNCTION "public"."get_model_token_trajectory"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_model_token_trajectory"(text) TO "postgres";

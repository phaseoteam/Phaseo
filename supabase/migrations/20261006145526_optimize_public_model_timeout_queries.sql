-- Generated in disposable CI run 37482819328, then reviewed for online deployment.
-- Retain the resolver OID and cleanup active state rather than drop/recreate.
-- Prebuild the expression index CONCURRENTLY on production before this migration.
SET LOCAL lock_timeout = '500ms';
SET LOCAL statement_timeout = '15s';
SET local check_function_bodies = off;



-- CREATE OR REPLACE retains dependent objects, ownership and existing grants.



CREATE OR REPLACE FUNCTION public.get_model_token_trajectory (
  p_model_id text
)
  RETURNS TABLE (
    release_date         timestamp with time zone,
    deprecation_date     timestamp with time zone,
    points               jsonb,
    token_milestones     jsonb,
    successor_milestones jsonb
  )
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

daily_tokens as (
  select date_trunc('day', fact.occurred_at at time zone 'utc') as day,
    sum(coalesce(nullif(tokens.explicit_total, 0),
      coalesce(tokens.input_tokens, 0) + coalesce(tokens.output_tokens, 0))) as tokens
  from public.v2_request_facts fact
  cross join model_row mr
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
    and mr.release_date is not null
    and fact.occurred_at >= mr.release_date
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

CREATE OR REPLACE FUNCTION public.resolve_public_model_id (
  p_model_id text,
  p_provider text DEFAULT NULL::text
)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  resolved text;
begin
  select dm.model_id into resolved
  from private.v2_rpc_models_compat dm
  where dm.model_id = p_model_id limit 1;
  if resolved is not null and btrim(resolved) <> '' then return resolved; end if;

  select a.model_slug into resolved
  from public.v2_model_aliases a
  where a.alias_slug = p_model_id and coalesce(a.enabled, true) limit 1;
  if resolved is not null and btrim(resolved) <> '' then return resolved; end if;

  select coalesce(nullif(pm.model_id, ''), pm.api_model_id) into resolved
  from private.v2_rpc_routes_compat pm
  where (p_provider is null or pm.provider_id = p_provider)
    and (pm.model_id = p_model_id or pm.api_model_id = p_model_id
      or pm.provider_api_model_id = p_model_id or pm.provider_model_slug = p_model_id)
  order by pm.is_active_gateway desc, pm.updated_at desc nulls last limit 1;
  if resolved is not null and btrim(resolved) <> '' then return resolved; end if;
  return null;
end;
$function$;

CREATE INDEX IF NOT EXISTS v2_request_facts_resolved_model_time_idx ON public.v2_request_facts
  USING btree (COALESCE(routed_model_slug, requested_model_slug, requested_model_input), occurred_at DESC);

COMMENT ON FUNCTION "public"."resolve_public_model_id"(text, text) IS 'Resolves canonical public model ids from canonical ids, aliases, and provider-facing model identifiers only.';

GRANT EXECUTE ON FUNCTION "public"."resolve_public_model_id"(text, text) TO PUBLIC, "anon", "authenticated";

REVOKE ALL ON FUNCTION "public"."resolve_public_model_id"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_public_model_id"(text, text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_public_model_id"(text, text) TO "service_role";


DO $index$
BEGIN
  IF NOT (SELECT indisvalid FROM pg_index
    WHERE indexrelid='public.v2_request_facts_resolved_model_time_idx'::regclass) THEN
    RAISE EXCEPTION 'Resolved model index is invalid; review the interrupted online build before deployment';
  END IF;
END;
$index$;

do $block$
declare cleanup_job bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into cleanup_job from cron.job where jobname = 'prune-byok-request-metadata';
    if cleanup_job is not null then
      perform cron.alter_job(cleanup_job,
        command := 'set statement_timeout = ''10s''; set lock_timeout = ''500ms''; select public.prune_byok_request_metadata(90, 500);');
    end if;
  end if;
end;
$block$;

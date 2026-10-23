CREATE OR REPLACE FUNCTION public.get_workspace_spend_buckets (
  p_workspace_id uuid,
  p_from         date,
  p_to           date,
  p_bucket       text DEFAULT 'day'::text,
  p_group_by     text DEFAULT 'none'::text
)
  RETURNS TABLE (
    bucket_start date,
    group_key    text,
    requests     bigint,
    cost_nanos   bigint
  )
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
-- A workspace's spend summed here per UTC day, week (starting Monday) or month,
-- optionally per model or provider, so callers never fetch usage rows to add
-- them up (PostgREST returns at most 1,000 rows). p_from and p_to are inclusive
-- UTC dates; the first and last week or month can be partial. Every bucket in the
-- range is returned, an empty one as a single 'all' row of zeros. Grouped results
-- keep the 8 groups that cost the most over the range and add the rest up as
-- 'other', so at most 100 buckets of 9 rows come back.
-- Service role only: the Slack agent checks the asker is a linked member first.
declare
  v_buckets integer;
  v_top constant integer := 8;
begin
  if p_workspace_id is null or p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid_range' using errcode = '22023';
  end if;
  if p_bucket is null or p_bucket not in ('day', 'week', 'month') then
    raise exception 'invalid_bucket' using errcode = '22023';
  end if;
  if p_group_by is null or p_group_by not in ('none', 'model', 'provider') then
    raise exception 'invalid_group_by' using errcode = '22023';
  end if;
  v_buckets := case p_bucket
    when 'day' then p_to - p_from + 1
    when 'week' then (date_trunc('week', p_to::timestamp)::date - date_trunc('week', p_from::timestamp)::date) / 7 + 1
    else (extract(year from p_to)::integer * 12 + extract(month from p_to)::integer)
      - (extract(year from p_from)::integer * 12 + extract(month from p_from)::integer) + 1
  end;
  if v_buckets > 100 then
    raise exception 'range_too_long' using errcode = '22023';
  end if;

  return query
  with usage as materialized (
    select date_trunc(p_bucket, daily.usage_date::timestamp)::date as bucket,
      case p_group_by
        when 'model' then coalesce(nullif(daily.model_slug, ''), 'unknown')
        when 'provider' then coalesce(nullif(route.provider_slug, ''), 'unknown')
        else 'all'
      end as grp,
      daily.requests,
      daily.cost_nanos
    from public.v2_private_usage_daily daily
    left join public.v2_model_provider_routes route
      on p_group_by = 'provider' and route.provider_model_id = daily.provider_model_id
    -- Served by the workspace/date index.
    where daily.workspace_id = p_workspace_id
      and daily.usage_date >= p_from
      and daily.usage_date <= p_to
  ), ranked as (
    select usage.grp, row_number() over (order by sum(usage.cost_nanos) desc, usage.grp) as position
    from usage
    group by usage.grp
  ), sums as (
    select usage.bucket,
      case when ranked.position <= v_top then usage.grp else 'other' end as grp,
      sum(usage.requests) as requests,
      sum(usage.cost_nanos) as cost_nanos
    from usage
    join ranked on ranked.grp = usage.grp
    group by 1, 2
  ), buckets as (
    select series::date as bucket
    from generate_series(date_trunc(p_bucket, p_from::timestamp), date_trunc(p_bucket, p_to::timestamp), ('1 ' || p_bucket)::interval) series
  )
  select buckets.bucket,
    coalesce(sums.grp, 'all'),
    coalesce(sums.requests, 0)::bigint,
    coalesce(sums.cost_nanos, 0)::bigint
  from buckets
  left join sums on sums.bucket = buckets.bucket
  order by buckets.bucket, coalesce(sums.cost_nanos, 0) desc, coalesce(sums.grp, 'all');
end;
$function$;

COMMENT ON FUNCTION "public"."get_workspace_spend_buckets"(uuid, date, date, text, text) IS 'A workspace''s requests and spend per UTC day, week (from Monday) or month, optionally by model or provider (top 8 plus other), summed in the database from v2_private_usage_daily. For the Slack agent''s usage tools; service role only.';

GRANT EXECUTE ON FUNCTION "public"."get_workspace_spend_buckets"(uuid, date, date, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_workspace_spend_buckets"(uuid, date, date, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_workspace_spend_buckets"(uuid, date, date, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_workspace_spend_buckets"(uuid, date, date, text, text) FROM PUBLIC, "anon", "authenticated";

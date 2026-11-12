CREATE OR REPLACE FUNCTION public.get_public_tool_call_timeseries (
  p_time_range  text    DEFAULT 'year'::text,
  p_bucket_size text    DEFAULT 'week'::text,
  p_top_n       integer DEFAULT 10
)
  RETURNS TABLE (
    bucket   timestamp with time zone,
    model_id text,
    requests bigint,
    tokens   bigint,
    colour   text
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with bounds as (
    select case p_time_range
      when 'today' then current_date
      when 'week' then current_date - 7
      when 'month' then current_date - 30
      when 'year' then current_date - 365
      else current_date - 365
    end as since_date
  ),
  top_models as (
    select usage.model_slug
    from public.reporting_usage_daily usage
    cross join bounds
    where usage.usage_date >= bounds.since_date
      and usage.tool_call_count > 0
      and lower(usage.model_slug) not in ('unknown', 'other')
    group by usage.model_slug
    order by sum(usage.tool_call_count) desc, usage.model_slug
    limit greatest(1, least(coalesce(p_top_n, 10), 100))
  )
  select
    (
      case p_bucket_size
        when 'day' then date_trunc('day', usage.usage_date::timestamp)
        else date_trunc('week', usage.usage_date::timestamp)
      end at time zone 'UTC'
    ) as bucket,
    usage.model_slug as model_id,
    sum(usage.tool_call_count)::bigint as requests,
    0::bigint as tokens,
    null::text as colour
  from public.reporting_usage_daily usage
  join top_models on top_models.model_slug = usage.model_slug
  cross join bounds
  where usage.usage_date >= bounds.since_date
    and usage.tool_call_count > 0
  group by 1, usage.model_slug
  order by 1, sum(usage.tool_call_count) desc, usage.model_slug;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_tool_call_timeseries"(text, text, integer) TO "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_tool_call_timeseries"(text, text, integer) TO "service_role";

COMMENT ON FUNCTION "public"."get_public_tool_call_timeseries"(text, text, integer) IS 'Privacy-safe tool-call counts by canonical model and day/week from V2 public usage rollups.';

REVOKE ALL ON FUNCTION "public"."get_public_tool_call_timeseries"(text, text, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "public"."get_public_tool_call_timeseries"(text, text, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_tool_call_timeseries"(text, text, integer) TO "postgres";

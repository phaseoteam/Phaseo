-- Daily usage per model for the compare page's Activity charts, summed in the database
-- across every visible route so the worker never adds rows itself.
CREATE OR REPLACE FUNCTION public.get_compare_usage_daily (
  p_model_ids text[],
  p_days      integer DEFAULT 30
)
  RETURNS TABLE (
    day_bucket       date,
    model_id         text,
    requests         bigint,
    input_tokens     numeric,
    output_tokens    numeric,
    reasoning_tokens numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with usage as (
    select u.usage_date, u.model_slug, u.requests, u.rollup_id
    from public.reporting_usage_daily u
    where u.model_slug = any (p_model_ids)
      and u.usage_date > current_date - least(greatest(coalesce(p_days, 30), 1), 90)
  ),
  meters as (
    select m.rollup_id,
      sum(m.quantity) filter (where m.meter_key = 'input_tokens') as input_tokens,
      sum(m.quantity) filter (where m.meter_key = 'output_tokens') as output_tokens,
      sum(m.quantity) filter (where m.meter_key = 'reasoning_tokens') as reasoning_tokens
    from public.v2_public_usage_daily_meters m
    where m.rollup_id in (select rollup_id from usage)
    group by m.rollup_id
  )
  select u.usage_date, u.model_slug, sum(u.requests)::bigint,
    sum(coalesce(m.input_tokens, 0)), sum(coalesce(m.output_tokens, 0)), sum(coalesce(m.reasoning_tokens, 0))
  from usage u left join meters m on m.rollup_id = u.rollup_id
  group by u.usage_date, u.model_slug
  order by u.model_slug, u.usage_date;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_compare_usage_daily"(text[], integer) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_compare_usage_daily"(text[], integer) TO "service_role";

COMMENT ON FUNCTION "public"."get_compare_usage_daily"(text[], integer) IS 'Daily requests and input, output and reasoning tokens per model across every visible route, for the compare page Activity charts.';

REVOKE ALL ON FUNCTION "public"."get_compare_usage_daily"(text[], integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_compare_usage_daily"(text[], integer) TO "postgres";

CREATE OR REPLACE FUNCTION public.get_usage_model_apps (
  p_model_ids text[],
  p_limit     integer                  DEFAULT 24,
  p_since     timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS TABLE (
    app_id           uuid,
    requests         bigint,
    success_requests bigint,
    total_tokens     bigint,
    title            text,
    image_url        text,
    url              text,
    last_seen        timestamp with time zone
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  with normalized_limit as (
    select greatest(1, least(coalesce(p_limit, 24), 100)) as value
  ),
  app_totals as (
    select
      d.app_id,
      sum(d.requests)::bigint as requests,
      sum(d.success_requests)::bigint as success_requests,
      sum(d.total_tokens)::bigint as total_tokens
    from public.v2_web_public_usage_daily d
    where array_length(p_model_ids, 1) is not null
      and d.canonical_model_id = any(p_model_ids)
      and (
        p_since is null
        or d.day_bucket >= (date_trunc('day', p_since at time zone 'utc') at time zone 'utc')
      )
    group by d.app_id
  )
  select
    t.app_id,
    t.requests,
    t.success_requests,
    t.total_tokens,
    coalesce(a.title, t.app_id::text) as title,
    nullif(trim(a.image_url), '') as image_url,
    nullif(trim(a.url), '') as url,
    a.last_seen
  from app_totals t
  join public.api_apps a
    on a.id = t.app_id
  where coalesce(a.is_public, false) = true
  order by t.total_tokens desc, t.requests desc, t.app_id asc
  limit (select value from normalized_limit);
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_usage_model_apps"(text[], integer, timestamp WITH time zone) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_usage_model_apps"(text[], integer, timestamp WITH time zone) TO "service_role";

COMMENT ON FUNCTION "public"."get_usage_model_apps"(text[], integer, timestamp with time zone) IS 'Aggregates app usage for model aliases from gateway_usage_rollup_daily_app_model and returns public app metadata.';

REVOKE ALL ON FUNCTION "public"."get_usage_model_apps"(text[], integer, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_usage_model_apps"(text[], integer, timestamp WITH time zone) TO "postgres";

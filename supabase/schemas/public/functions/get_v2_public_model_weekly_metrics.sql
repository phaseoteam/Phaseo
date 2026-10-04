CREATE OR REPLACE FUNCTION public.get_v2_public_model_weekly_metrics()
  RETURNS TABLE (
    model_slug             text,
    popularity_tokens_week numeric,
    weekly_usage_metric    text,
    weekly_usage_quantity  numeric,
    weekly_usage_unit      text,
    throughput_week        numeric,
    latency_week           numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with request_totals as (
    select
      rollup.model_slug,
      sum(rollup.requests)::numeric as requests
    from public.v2_public_usage_daily rollup
    where rollup.usage_date >= current_date - 6
      and rollup.usage_date <= current_date
    group by rollup.model_slug
  )
  select
    metric.model_slug,
    metric.popularity_tokens_week,
    case
      when metric.weekly_usage_metric = 'characters'
        and lower(coalesce(model.metadata->>'model_type', '')) <> 'audio'
        and array_to_string(model.output_modalities, ',') !~ 'audio'
        then 'requests'
      else metric.weekly_usage_metric
    end as weekly_usage_metric,
    case
      when metric.weekly_usage_metric = 'characters'
        and lower(coalesce(model.metadata->>'model_type', '')) <> 'audio'
        and array_to_string(model.output_modalities, ',') !~ 'audio'
        then coalesce(requests.requests, 0)
      else metric.weekly_usage_quantity
    end as weekly_usage_quantity,
    case
      when metric.weekly_usage_metric = 'characters'
        and lower(coalesce(model.metadata->>'model_type', '')) <> 'audio'
        and array_to_string(model.output_modalities, ',') !~ 'audio'
        then 'requests'
      else metric.weekly_usage_unit
    end as weekly_usage_unit,
    metric.throughput_week,
    metric.latency_week
  from public.get_v2_public_model_weekly_metrics_base() metric
  join public.v2_models model on model.model_slug = metric.model_slug
  left join request_totals requests on requests.model_slug = metric.model_slug
  order by weekly_usage_quantity desc, metric.model_slug;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_public_model_weekly_metrics"() TO "service_role";

COMMENT ON FUNCTION "public"."get_v2_public_model_weekly_metrics"() IS 'Returns model-appropriate seven-day primary usage plus token and sample-weighted performance metrics.';

REVOKE ALL ON FUNCTION "public"."get_v2_public_model_weekly_metrics"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_public_model_weekly_metrics"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_public_model_weekly_metrics"() FROM PUBLIC, "anon", "authenticated";

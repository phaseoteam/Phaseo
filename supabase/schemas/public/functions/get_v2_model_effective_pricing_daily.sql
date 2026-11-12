CREATE OR REPLACE FUNCTION public.get_v2_model_effective_pricing_daily (
  p_model_slug   text,
  p_provider_ids text[] DEFAULT NULL::text[],
  p_since        date   DEFAULT NULL::date,
  p_until        date   DEFAULT NULL::date
)
  RETURNS TABLE (
    day_bucket          date,
    provider_id         text,
    pricing_plan        text,
    input_tokens        numeric,
    output_tokens       numeric,
    cached_read_tokens  numeric,
    cached_write_tokens numeric,
    input_cost_nanos    numeric,
    output_cost_nanos   numeric,
    total_cost_nanos    numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  select
    usage.usage_date,
    usage.provider_id,
    usage.pricing_plan,
    usage.input_tokens,
    usage.output_tokens,
    usage.cached_read_tokens,
    usage.cached_write_tokens,
    usage.input_cost_nanos,
    usage.output_cost_nanos,
    usage.total_cost_nanos
  from public.reporting_effective_pricing_daily usage
  where usage.model_slug = lower(trim(p_model_slug))
    and (p_provider_ids is null or usage.provider_id = any(p_provider_ids))
    and (p_since is null or usage.usage_date >= p_since)
    and (p_until is null or usage.usage_date <= p_until)
  order by usage.usage_date, usage.provider_id, usage.pricing_plan;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_effective_pricing_daily"(text, text[], date, date) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_v2_model_effective_pricing_daily"(text, text[], date, date) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_v2_model_effective_pricing_daily"(text, text[], date, date) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_v2_model_effective_pricing_daily"(text, text[], date, date) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.replace_v2_subscription_model_usage (
  p_close uuid[],
  p_insert jsonb,
  p_at timestamptz
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  -- Retire changed or removed rows and insert their replacements in one transaction, so a failed insert
  -- leaves the previously published rows in place.
  update public.v2_subscription_plan_model_usage set effective_to = p_at
  where effective_to is null and usage_uuid = any(coalesce(p_close, '{}'));

  insert into public.v2_subscription_plan_model_usage (
    plan_uuid, model_slug, scenario, monthly_tokens, workload, basis, confidence, plan_price_usd,
    api_equivalent_usd_per_mtok, source_name, source_record_id, source_url, note, measured_on, promo_until,
    metadata, verified_at, effective_from
  )
  select row.plan_uuid, row.model_slug, row.scenario, row.monthly_tokens, row.workload, row.basis, row.confidence, row.plan_price_usd,
    row.api_equivalent_usd_per_mtok, row.source_name, row.source_record_id, row.source_url, row.note, row.measured_on, row.promo_until,
    coalesce(row.metadata, '{}'), p_at, p_at
  from jsonb_populate_recordset(null::public.v2_subscription_plan_model_usage, coalesce(p_insert, '[]')) row;
end
$function$;

REVOKE ALL ON FUNCTION "public"."replace_v2_subscription_model_usage"(uuid[], jsonb, timestamptz) FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."replace_v2_subscription_model_usage"(uuid[], jsonb, timestamptz) TO "service_role";

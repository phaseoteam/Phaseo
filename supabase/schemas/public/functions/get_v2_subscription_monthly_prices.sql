CREATE OR REPLACE FUNCTION public.get_v2_subscription_monthly_prices (
  p_lab_slug text DEFAULT NULL
)
  RETURNS TABLE (
    plan_uuid         uuid,
    monthly_price_usd numeric
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  -- Each active plan's current monthly USD price for one account or seat; see
  -- get_v2_subscription_monthly_price_details for the rule.
  select details.plan_uuid, details.monthly_price_usd
  from public.get_v2_subscription_monthly_price_details(p_lab_slug) details
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_v2_subscription_monthly_prices"(text) TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_v2_subscription_monthly_prices"(text) TO "service_role";

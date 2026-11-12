CREATE OR REPLACE FUNCTION public.resolve_v2_effective_pricing_plan (
  p_fact_tier text,
  p_sku_tier  text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case lower(nullif(trim(p_sku_tier), ''))
    when 'free' then 'free'
    else coalesce(
      public.normalize_v2_service_tier(p_fact_tier),
      public.normalize_v2_service_tier(p_sku_tier),
      'standard'
    )
  end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."resolve_v2_effective_pricing_plan"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."resolve_v2_effective_pricing_plan"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."resolve_v2_effective_pricing_plan"(text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."resolve_v2_effective_pricing_plan"(text, text) FROM PUBLIC, "anon", "authenticated";

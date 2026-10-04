CREATE OR REPLACE FUNCTION public.set_v2_request_fact_service_tier()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.service_tier_requested := coalesce(
    public.normalize_v2_service_tier(new.service_tier_requested),
    public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_requested')
  );
  new.service_tier_observed := coalesce(
    public.normalize_v2_service_tier(new.service_tier_observed),
    public.normalize_v2_service_tier(new.safe_metadata->>'service_tier_observed')
  );
  new.service_tier_slug := coalesce(
    public.normalize_v2_service_tier(new.service_tier_slug),
    public.normalize_v2_service_tier(new.safe_metadata->>'service_tier'),
    new.service_tier_observed,
    new.service_tier_requested,
    case when new.endpoint = 'batch' then 'batch' else null end
  );
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."set_v2_request_fact_service_tier"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_v2_request_fact_service_tier"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_v2_request_fact_service_tier"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.guard_conditional_provider_catalog_pricing()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
begin
  if new.metadata ->> 'managed_by' = 'provider_catalog'
    and exists (
      select 1
      from public.v2_model_provider_routes route
      join public.provider_catalog_route_candidates candidate
        on candidate.run_id = (new.metadata ->> 'source_run_id')::uuid
       and candidate.provider_slug = route.provider_slug
       and candidate.canonical_model_slug = route.model_slug
       and candidate.provider_model_slug = route.provider_model_slug
      cross join lateral jsonb_array_elements(candidate.pricing) as price(value)
      where route.provider_model_id = new.provider_model_id
        and case when jsonb_typeof(price.value -> 'conditions') = 'array'
          then jsonb_array_length(price.value -> 'conditions') > 0
          else false end
    ) then
    raise exception 'provider_catalog_conditional_pricing_requires_review';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."guard_conditional_provider_catalog_pricing"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."guard_conditional_provider_catalog_pricing"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."guard_conditional_provider_catalog_pricing"() FROM PUBLIC, "anon", "authenticated", "service_role";

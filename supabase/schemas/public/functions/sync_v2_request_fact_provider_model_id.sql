CREATE OR REPLACE FUNCTION public.sync_v2_request_fact_provider_model_id()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.provider_model_id is not null then
    update public.v2_request_facts request
    set provider_model_id = new.provider_model_id,
        routed_model_slug = route.model_slug,
        requested_model_slug = case
          when lower(request.requested_model_input) like '%:free' then route.model_slug
          else request.requested_model_slug
        end
    from public.v2_model_provider_routes route
    where route.provider_model_id = new.provider_model_id
      and request.request_event_id = new.request_event_id
      and (
        request.provider_model_id is distinct from new.provider_model_id
        or request.routed_model_slug is distinct from route.model_slug
        or (
          lower(request.requested_model_input) like '%:free'
          and request.requested_model_slug is distinct from route.model_slug
        )
      );
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."sync_v2_request_fact_provider_model_id"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."sync_v2_request_fact_provider_model_id"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."sync_v2_request_fact_provider_model_id"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."sync_v2_request_fact_provider_model_id"() FROM PUBLIC, "anon", "authenticated";

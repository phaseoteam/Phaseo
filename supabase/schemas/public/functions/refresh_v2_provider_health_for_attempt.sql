CREATE OR REPLACE FUNCTION public.refresh_v2_provider_health_for_attempt()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  fact_row record;
begin
  if tg_op <> 'INSERT' then
    select occurred_at::date usage_date, coalesce(routed_model_slug, requested_model_slug) model_slug
      into fact_row from public.reporting_request_facts where request_event_id = old.request_event_id;
    perform private.enqueue_provider_health_refresh(fact_row.usage_date, fact_row.model_slug, old.provider_model_id);
  end if;
  if tg_op <> 'DELETE' then
    select occurred_at::date usage_date, coalesce(routed_model_slug, requested_model_slug) model_slug
      into fact_row from public.reporting_request_facts where request_event_id = new.request_event_id;
    perform private.enqueue_provider_health_refresh(fact_row.usage_date, fact_row.model_slug, new.provider_model_id);
  end if;
  return null;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."refresh_v2_provider_health_for_attempt"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."refresh_v2_provider_health_for_attempt"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."refresh_v2_provider_health_for_attempt"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."refresh_v2_provider_health_for_attempt"() FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION private.enqueue_public_reporting_for_request()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if row(old.api_model_id, old.pricing_plan, old.is_free_variant)
    is distinct from row(new.api_model_id, new.pricing_plan, new.is_free_variant) then
    perform private.enqueue_public_reporting_refresh(f.occurred_at)
    from public.v2_request_facts f
    where f.gateway_request_id = new.id and f.gateway_request_created_at = new.created_at;
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."enqueue_public_reporting_for_request"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_public_reporting_for_request"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enqueue_public_reporting_for_request"() TO "postgres";

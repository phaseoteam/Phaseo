CREATE OR REPLACE FUNCTION public.gateway_cleanup_batch_hold_key_usage()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if new.status = 'released' and old.status is distinct from new.status and new.key_id is not null then
    delete from public.gateway_requests
    where workspace_id = new.workspace_id
      and key_id = new.key_id
      and request_id like 'batch_hold_usage:' || new.reservation_id || ':%';
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_cleanup_batch_hold_key_usage"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_cleanup_batch_hold_key_usage"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_cleanup_batch_hold_key_usage"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_cleanup_batch_hold_key_usage"() FROM PUBLIC, "anon", "authenticated";

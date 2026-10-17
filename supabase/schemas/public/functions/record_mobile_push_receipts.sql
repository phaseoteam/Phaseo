CREATE OR REPLACE FUNCTION public.record_mobile_push_receipts (
  p_results jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records receipts Expo reported as errors: [{ "id", "errorCode", "errorMessage" }]. The push
-- is marked failed and DeviceNotRegistered retires the device.
declare
  v_result jsonb;
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'invalid_mobile_push_receipts';
  end if;

  with results as (
    select distinct on (r.id) r.id, left(r."errorCode", 100) as error_code, left(r."errorMessage", 1000) as error_message
    from jsonb_to_recordset(p_results) as r(id uuid, "errorCode" text, "errorMessage" text)
    where r.id is not null
    order by r.id
  ),
  failed as (
    update public.mobile_push_deliveries x
    set status = 'failed',
        error_code = coalesce(r.error_code, 'receipt_error'),
        error_message = r.error_message,
        updated_at = now()
    from results r
    where x.id = r.id and x.status = 'sent'
    returning x.device_id, x.error_code
  ),
  invalidated as (
    update public.mobile_push_devices dev
    set status = 'invalid', invalidated_at = now(), updated_at = now()
    where dev.id in (select f.device_id from failed f where f.error_code = 'DeviceNotRegistered')
      and dev.status = 'active'
    returning dev.id
  )
  select jsonb_build_object('failed', count(*), 'invalidated', (select count(*) from invalidated)) into v_result
  from failed;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) FROM PUBLIC, "anon", "authenticated";

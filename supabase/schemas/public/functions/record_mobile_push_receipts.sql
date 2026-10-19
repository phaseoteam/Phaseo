CREATE OR REPLACE FUNCTION public.record_mobile_push_receipts (
  p_results jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Closes the receipts Expo returned: [{ "id", "status": "ok" | "error", "errorCode",
-- "errorMessage" }]. An error marks the push failed, with every row it carried, and
-- DeviceNotRegistered retires the device. Tickets left out stay open, so
-- claim_mobile_push_receipts hands them out again.
declare
  v_result jsonb;
begin
  if jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'invalid_mobile_push_receipts';
  end if;

  with results as (
    select distinct on (r.id) r.id, r.status, left(r."errorCode", 100) as error_code, left(r."errorMessage", 1000) as error_message
    from jsonb_to_recordset(p_results) as r(id uuid, status text, "errorCode" text, "errorMessage" text)
    where r.id is not null and r.status in ('ok', 'error')
    order by r.id
  ),
  checked as (
    update public.mobile_push_deliveries x
    set status = case when r.status = 'error' then 'failed' else x.status end,
        error_code = case when r.status = 'error' then coalesce(r.error_code, 'receipt_error') else x.error_code end,
        error_message = case when r.status = 'error' then r.error_message else x.error_message end,
        receipt_checked_at = now(),
        updated_at = now()
    from results r
    where x.id = r.id and x.status = 'sent' and x.receipt_checked_at is null
    returning x.id, x.device_id, x.status, x.error_code, x.error_message
  ),
  carried as (
    update public.mobile_push_deliveries x
    set status = 'failed', error_code = c.error_code, error_message = c.error_message, updated_at = now()
    from checked c
    where c.status = 'failed' and x.merged_into = c.id and x.status = 'sent'
    returning x.id
  ),
  invalidated as (
    update public.mobile_push_devices dev
    set status = 'invalid', invalidated_at = now(), updated_at = now()
    where dev.id in (select c.device_id from checked c where c.status = 'failed' and c.error_code = 'DeviceNotRegistered')
      and dev.status = 'active'
    returning dev.id
  )
  select jsonb_build_object(
    'checked', count(*),
    'failed', count(*) filter (where c.status = 'failed'),
    'invalidated', (select count(*) from invalidated)
  ) into v_result
  from checked c;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_mobile_push_receipts"(jsonb) FROM PUBLIC, "anon", "authenticated";

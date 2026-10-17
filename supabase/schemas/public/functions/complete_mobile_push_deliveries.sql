CREATE OR REPLACE FUNCTION public.complete_mobile_push_deliveries (
  p_claim_token uuid,
  p_results     jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Records one batch of Expo results: [{ "id", "status": "sent" | "failed" | "retry",
-- "ticketId", "errorCode", "errorMessage" }]. Only rows still held by this claim change.
-- Retries back off from 30 seconds to an hour and give up after five attempts.
-- DeviceNotRegistered retires the device.
declare
  v_result jsonb;
begin
  if p_claim_token is null or jsonb_typeof(p_results) is distinct from 'array' then
    raise exception 'invalid_mobile_push_results';
  end if;

  with results as (
    select distinct on (r.id)
      r.id,
      r.status,
      left(r."ticketId", 200) as ticket_id,
      left(r."errorCode", 100) as error_code,
      left(r."errorMessage", 1000) as error_message
    from jsonb_to_recordset(p_results) as r(id uuid, status text, "ticketId" text, "errorCode" text, "errorMessage" text)
    where r.id is not null and r.status in ('sent', 'failed', 'retry')
    order by r.id
  ),
  completed as (
    update public.mobile_push_deliveries x
    set status = case when r.status = 'sent' then 'sent' when r.status = 'retry' and x.attempts < 5 then 'pending' else 'failed' end,
        not_before = case
          when r.status = 'retry' and x.attempts < 5 then now() + make_interval(secs => least(3600, 30 * power(2, x.attempts)))
          else x.not_before
        end,
        expo_ticket_id = case when r.status = 'sent' then r.ticket_id end,
        sent_at = case when r.status = 'sent' then now() end,
        error_code = case when r.status = 'sent' then null else coalesce(r.error_code, 'push_failed') end,
        error_message = case when r.status = 'sent' then null else r.error_message end,
        claim_token = null,
        claimed_at = null,
        updated_at = now()
    from results r
    where x.id = r.id and x.claim_token = p_claim_token and x.status = 'processing'
    returning x.device_id, x.status, x.error_code
  ),
  invalidated as (
    update public.mobile_push_devices dev
    set status = 'invalid', invalidated_at = now(), updated_at = now()
    where dev.id in (select c.device_id from completed c where c.error_code = 'DeviceNotRegistered')
      and dev.status = 'active'
    returning dev.id
  )
  select jsonb_build_object(
    'sent', count(*) filter (where c.status = 'sent'),
    'retrying', count(*) filter (where c.status = 'pending'),
    'failed', count(*) filter (where c.status = 'failed'),
    'invalidated', (select count(*) from invalidated)
  ) into v_result
  from completed c;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."complete_mobile_push_deliveries"(uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."complete_mobile_push_deliveries"(uuid, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."complete_mobile_push_deliveries"(uuid, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."complete_mobile_push_deliveries"(uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

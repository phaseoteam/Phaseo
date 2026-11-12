CREATE OR REPLACE FUNCTION public.capture_gateway_billing_alert()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare alert_uuid uuid;
begin
  if new.billed_at is not null then
    update public.gateway_billing_alerts set status = 'resolved', resolved_at = now()
    where operation_id = new.id and status = 'open';
    return new;
  end if;
  if new.kind not in ('video', 'batch') or new.meta->>'billingReason' is distinct from 'unexpected_zero_cost' then
    return new;
  end if;
  insert into public.gateway_billing_alerts(operation_id, workspace_id, resource_id, kind, provider, reason)
  values(new.id, new.workspace_id, new.internal_id, new.kind, new.provider, 'unexpected_zero_cost')
  on conflict(operation_id, reason) do nothing;
  select id into alert_uuid from public.gateway_billing_alerts
    where operation_id = new.id and reason = 'unexpected_zero_cost';
  perform public.queue_gateway_billing_alert(alert_uuid);
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."capture_gateway_billing_alert"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."capture_gateway_billing_alert"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."capture_gateway_billing_alert"() FROM PUBLIC, "anon", "authenticated", "service_role";

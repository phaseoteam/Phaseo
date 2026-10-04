CREATE OR REPLACE FUNCTION public.queue_gateway_billing_alert (
  p_alert_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  alert public.gateway_billing_alerts%rowtype;
  destination public.notification_destinations%rowtype;
  event_uuid uuid;
begin
  select * into alert from public.gateway_billing_alerts where id = p_alert_id for update;
  if not found or alert.event_id is not null or alert.status <> 'open' then return false; end if;
  select d.* into destination
  from public.gateway_billing_alert_config c
  join public.notification_destinations d on d.id = c.destination_id
  where c.singleton and d.status = 'active' and d.type = 'slack';
  if not found then return false; end if;

  -- email_outbox is the existing notification event store. This event has no
  -- email leg: sent_at closes that legacy drain; Slack delivery has its own status.
  insert into public.email_outbox(kind, template, to_email, subject, workspace_id, dedupe_key, payload, sent_at)
  values ('billing_anomaly', 'notification_only', '', 'Unexpected zero-cost generation',
    destination.workspace_id, 'billing_anomaly:' || alert.id,
    jsonb_build_object(
      'title', 'Unexpected zero-cost generation',
      'message', format('A paid %s job was priced at zero. Workspace: %s. Job: %s. Provider: %s. Review billing and the reservation before releasing credit. Alert: %s.',
        alert.kind, alert.workspace_id, alert.resource_id, coalesce(alert.provider, 'unknown'), alert.id),
      'alert_id', alert.id, 'source_workspace_id', alert.workspace_id,
      'resource_id', alert.resource_id, 'kind', alert.kind, 'reason', alert.reason), now())
  returning id into event_uuid;

  insert into public.notification_routed_events(event_id, workspace_id)
    values(event_uuid, destination.workspace_id);
  insert into public.notification_delivery_attempts(event_id, destination_id, workspace_id)
    values(event_uuid, destination.id, destination.workspace_id);
  update public.gateway_billing_alerts set event_id = event_uuid where id = alert.id;
  return true;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."queue_gateway_billing_alert"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."queue_gateway_billing_alert"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."queue_gateway_billing_alert"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."queue_gateway_billing_alert"(uuid) FROM PUBLIC, "anon", "authenticated";

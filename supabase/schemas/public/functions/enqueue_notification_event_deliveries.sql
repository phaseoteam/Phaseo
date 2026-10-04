CREATE OR REPLACE FUNCTION public.enqueue_notification_event_deliveries (
  p_event_id                 uuid,
  p_workspace_id             uuid,
  p_event_kind               text,
  p_requested_destination_id uuid DEFAULT NULL::uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  claimed_event_id uuid;
  inserted_count integer := 0;
begin
  insert into public.notification_routed_events (event_id, workspace_id)
  values (p_event_id, p_workspace_id)
  on conflict (event_id) do nothing
  returning event_id into claimed_event_id;

  if claimed_event_id is null then
    return 0;
  end if;

  if p_event_kind = 'notification_test' and p_requested_destination_id is not null then
    insert into public.notification_delivery_attempts (event_id, destination_id, workspace_id, status)
    select p_event_id, destination.id, p_workspace_id, 'pending'
    from public.notification_destinations destination
    where destination.id = p_requested_destination_id
      and destination.workspace_id = p_workspace_id
      and destination.status = 'active'
    on conflict (event_id, destination_id) do nothing;
  else
    insert into public.notification_delivery_attempts (event_id, destination_id, workspace_id, status)
    select p_event_id, route.destination_id, p_workspace_id, 'pending'
    from public.notification_event_destinations route
    join public.notification_destinations destination on destination.id = route.destination_id
    where route.workspace_id = p_workspace_id
      and route.event_kind = p_event_kind
      and destination.status = 'active'
    on conflict (event_id, destination_id) do nothing;
  end if;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enqueue_notification_event_deliveries"(uuid, uuid, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."enqueue_notification_event_deliveries"(uuid, uuid, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enqueue_notification_event_deliveries"(uuid, uuid, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."enqueue_notification_event_deliveries"(uuid, uuid, text, uuid) FROM PUBLIC, "anon", "authenticated";

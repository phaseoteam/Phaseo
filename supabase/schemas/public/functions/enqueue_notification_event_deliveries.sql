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
  spend_rule_id uuid;
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
    get diagnostics inserted_count = row_count;
    return inserted_count;
  end if;

  -- A spend rule with destinations of its own sends there instead of the workspace's routes for
  -- the kind (active destinations only); a rule without any uses the routes.
  if p_event_kind in ('spend_alert', 'spend_blocked') then
    select rule.id into spend_rule_id
    from public.email_outbox event
    join public.workspace_spend_rules rule
      on rule.workspace_id = p_workspace_id
      and rule.id = case when event.payload ->> 'rule_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (event.payload ->> 'rule_id')::uuid end
    where event.id = p_event_id
      and exists (
        select 1 from public.workspace_spend_rule_destinations rule_destination
        where rule_destination.rule_id = rule.id and rule_destination.workspace_id = p_workspace_id
      );
  end if;

  if spend_rule_id is not null then
    insert into public.notification_delivery_attempts (event_id, destination_id, workspace_id, status)
    select p_event_id, rule_destination.destination_id, p_workspace_id, 'pending'
    from public.workspace_spend_rule_destinations rule_destination
    join public.notification_destinations destination on destination.id = rule_destination.destination_id
    where rule_destination.rule_id = spend_rule_id
      and rule_destination.workspace_id = p_workspace_id
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

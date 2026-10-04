CREATE OR REPLACE FUNCTION public.set_notification_event_destinations (
  p_workspace_id    uuid,
  p_event_kind      text,
  p_destination_ids uuid[]
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || ':' || p_event_kind, 0));

  if p_event_kind not in ('low_balance', 'auto_top_up_failed', 'payment_method_expiring', 'model_deprecation') then
    raise exception 'invalid_notification_event_kind';
  end if;

  if (
    select count(*)
    from public.notification_destinations
    where workspace_id = p_workspace_id
      and status = 'active'
      and id = any(p_destination_ids)
  ) <> cardinality(p_destination_ids) then
    raise exception 'notification_destination_not_found';
  end if;

  delete from public.notification_event_destinations
  where workspace_id = p_workspace_id and event_kind = p_event_kind;

  insert into public.notification_event_destinations (workspace_id, event_kind, destination_id)
  select p_workspace_id, p_event_kind, destination_id
  from unnest(p_destination_ids) as destination_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_notification_event_destinations"(uuid, text, uuid[]) FROM PUBLIC, "anon", "authenticated";

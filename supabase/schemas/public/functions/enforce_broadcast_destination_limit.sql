CREATE OR REPLACE FUNCTION public.enforce_broadcast_destination_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_limit integer;
  v_existing integer;
begin
  if tg_op = 'UPDATE'
    and new.workspace_id is not distinct from old.workspace_id
    and new.destination_id is not distinct from old.destination_id then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('broadcast_destination:' || new.workspace_id::text || ':' || new.destination_id, 0)
  );

  -- Definer rights let this read the operator-only override table when an admin
  -- inserts through RLS.
  select coalesce((
    select override.max_destinations_per_type
    from public.workspace_broadcast_destination_limits override
    where override.workspace_id = new.workspace_id
  ), 5) into v_limit;

  select count(*) into v_existing
  from public.workspace_broadcast_destinations destination
  where destination.workspace_id = new.workspace_id
    and destination.destination_id = new.destination_id
    and destination.id <> new.id;

  if v_existing >= v_limit then
    raise exception 'broadcast_destination_limit_reached'
      using errcode = '23514',
        detail = pg_catalog.format('A workspace may have %s %s destinations.', v_limit, new.destination_id);
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."enforce_broadcast_destination_limit"() TO "service_role";

COMMENT ON FUNCTION "public"."enforce_broadcast_destination_limit"() IS 'Caps Broadcast destinations per workspace and type (default 5, overridable in workspace_broadcast_destination_limits) using a transaction-scoped advisory lock.';

REVOKE ALL ON FUNCTION "public"."enforce_broadcast_destination_limit"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enforce_broadcast_destination_limit"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."enforce_broadcast_destination_limit"() FROM PUBLIC, "anon", "authenticated";

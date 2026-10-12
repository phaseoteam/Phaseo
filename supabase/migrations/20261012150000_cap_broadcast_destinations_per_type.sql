-- Cap Broadcast destinations at 5 per workspace and type, with an operator-only
-- override table for workspaces that need more. The cap is a trigger so it also
-- covers admins inserting through RLS, not just the two APIs. Production has no
-- Broadcast destinations when this ships, so no existing workspace is over it.
SET local check_function_bodies = off;

CREATE TABLE "public"."workspace_broadcast_destination_limits" (
  "workspace_id"              uuid                     NOT NULL,
  "max_destinations_per_type" integer                  NOT NULL,
  "reason"                    text,
  "set_by"                    uuid,
  "created_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_broadcast_destination_limits_max_destinations_per_type_check" CHECK (((max_destinations_per_type > 0) AND (max_destinations_per_type <= 1000))),
  CONSTRAINT "workspace_broadcast_destination_limits_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "workspace_broadcast_destination_limits_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_broadcast_destination_limits"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER workspace_broadcast_destination_limits_set_updated_at
  BEFORE UPDATE ON public.workspace_broadcast_destination_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_broadcast_destination_limits"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_broadcast_destination_limits" IS 'Operator-managed override for how many Broadcast destinations of one type a workspace may create. Without a row the default of 5 applies. Manage as service_role.';

REVOKE ALL ON TABLE "public"."workspace_broadcast_destination_limits" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_broadcast_destination_limits" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_broadcast_destination_limits" FROM "anon", "authenticated";

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

CREATE TRIGGER enforce_broadcast_destination_limit
  BEFORE INSERT OR UPDATE OF workspace_id, destination_id ON public.workspace_broadcast_destinations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_broadcast_destination_limit();

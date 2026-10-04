CREATE OR REPLACE FUNCTION public.gateway_finish_workspace_publication (
  p_workspace_id uuid,
  p_revision     uuid,
  p_lease_id     uuid,
  p_success      boolean
)
  RETURNS text
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare pending public.gateway_workspace_publications%rowtype;
begin
  if p_success is null then raise exception 'invalid_publication_result' using errcode='22023'; end if;
  select * into pending from public.gateway_workspace_publications p
    where p.workspace_id = p_workspace_id and p.lease_id = p_lease_id for update;
  if not found then return 'lost'; end if;
  if pending.revision = p_revision and p_success then
    delete from public.gateway_workspace_publications where workspace_id = p_workspace_id;
    return 'completed';
  end if;
  update public.gateway_workspace_publications set lease_id = null, lease_until = null,
    available_at = case when pending.revision <> p_revision then clock_timestamp()
      else clock_timestamp() + make_interval(secs => least(3600, 30 * (2 ^ least(pending.attempts, 7)))::integer) end
    where workspace_id = p_workspace_id;
  if pending.revision <> p_revision then return 'superseded'; end if;
  return case when pending.attempts >= 10 then 'exhausted' else 'retry' end;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_finish_workspace_publication"(uuid, uuid, uuid, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_finish_workspace_publication"(uuid, uuid, uuid, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_finish_workspace_publication"(uuid, uuid, uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_finish_workspace_publication"(uuid, uuid, uuid, boolean) FROM PUBLIC, "anon", "authenticated";

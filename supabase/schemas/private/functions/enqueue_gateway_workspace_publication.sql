CREATE OR REPLACE FUNCTION private.enqueue_gateway_workspace_publication (
  p_workspace_id uuid
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into public.gateway_workspace_publications as pending (workspace_id)
    select w.id from public.workspaces w where w.id = p_workspace_id
  on conflict (workspace_id) do update set
    revision = gen_random_uuid(), available_at = clock_timestamp(), attempts = 0;
  -- Preserve an active lease. Its acknowledgement must compare the revision.
$function$;

REVOKE ALL ON FUNCTION "private"."enqueue_gateway_workspace_publication"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."enqueue_gateway_workspace_publication"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."enqueue_gateway_workspace_publication"(uuid) TO "postgres";

CREATE OR REPLACE FUNCTION public.workspace_key_storage_incidents (
  p_workspace_id uuid
)
  RETURNS TABLE (
    id               uuid,
    location_id      text,
    action           text,
    title            text,
    customer_message text,
    source_url       text,
    applied_at       timestamp with time zone,
    keys             bigint,
    key_ids          uuid[]
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Incidents from the last 90 days that changed this workspace's keys, newest
  -- first, for the notice on the API keys and Key security pages. Service-only:
  -- callers verify workspace access first.
  select incident.id, incident.location_id, incident.action, incident.title, incident.customer_message,
    incident.source_url, incident.applied_at, count(*), array_agg(changed.key_id order by changed.key_id)
  from public.key_storage_incident_keys as changed
  join public.key_storage_incidents as incident on incident.id = changed.incident_id
  where changed.workspace_id = p_workspace_id
    and incident.applied_at > now() - interval '90 days'
  group by incident.id
  order by incident.applied_at desc;
$function$;

COMMENT ON FUNCTION "public"."workspace_key_storage_incidents"(uuid) IS 'Key storage incidents from the last 90 days that revoked or paused this workspace''s keys. Service-only.';

GRANT EXECUTE ON FUNCTION "public"."workspace_key_storage_incidents"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."workspace_key_storage_incidents"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_key_storage_incidents"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."workspace_key_storage_incidents"(uuid) FROM PUBLIC, "anon", "authenticated";

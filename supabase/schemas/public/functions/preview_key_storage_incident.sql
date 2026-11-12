CREATE OR REPLACE FUNCTION public.preview_key_storage_incident (
  p_location_id         text,
  p_keys_created_before timestamp with time zone,
  p_action              text DEFAULT 'revoke'::text
)
  RETURNS TABLE (
    keys       bigint,
    workspaces bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- The keys apply_key_storage_incident would change. Service-only.
  select count(*), count(distinct key.workspace_id)
  from public.keys as key
  where key.storage_locations @> array[p_location_id]
    and cardinality(key.storage_locations) > 0
    and key.created_at < p_keys_created_before
    and key.key_kind = 'standard'
    and key.status = any(case when p_action = 'pause' then array['active'] else array['active', 'paused'] end)
    and key.name not in ('__chat_route_managed_key__', '__slack_agent_managed_key__');
$function$;

COMMENT ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) IS 'How many keys and workspaces a key storage incident would revoke or pause. Service-only.';

GRANT EXECUTE ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."preview_key_storage_incident"(text, timestamp with time zone, text) FROM PUBLIC, "anon", "authenticated";

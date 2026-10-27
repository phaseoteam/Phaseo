CREATE OR REPLACE FUNCTION public.workspace_key_security_summary (
  p_workspace_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  -- Counts for the Security page overview, and live keys per storage location.
  -- Service-only: callers verify workspace access first.
  with keys as (
    select * from public.workspace_key_security(p_workspace_id)
  )
  select jsonb_build_object(
    'total', count(*),
    'paused', count(*) filter (where keys.status = 'paused'),
    'no_spend_limit', count(*) filter (where not keys.has_spend_limit),
    'never_expires', count(*) filter (where keys.expires_at is null),
    'idle', count(*) filter (where keys.idle),
    'safe_to_remove', count(*) filter (where keys.safe_to_remove),
    'no_ip_allowlist', count(*) filter (where not keys.has_ip_allowlist),
    'no_storage_location', count(*) filter (where cardinality(keys.storage_locations) = 0),
    'locations', coalesce((
      select jsonb_agg(jsonb_build_object('id', location.id, 'keys', location.keys) order by location.keys desc, location.id)
      from (
        select stored.id, count(*) as keys
        from keys, unnest(keys.storage_locations) as stored(id)
        group by stored.id
      ) as location
    ), '[]'::jsonb)
  )
  from keys;
$function$;

COMMENT ON FUNCTION "public"."workspace_key_security_summary"(uuid) IS 'Security page overview counts for a workspace''s live API keys, with live keys per storage location. Service-only; callers verify workspace access.';

GRANT EXECUTE ON FUNCTION "public"."workspace_key_security_summary"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."workspace_key_security_summary"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."workspace_key_security_summary"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."workspace_key_security_summary"(uuid) FROM PUBLIC, "anon", "authenticated";

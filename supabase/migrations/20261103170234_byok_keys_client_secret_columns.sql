-- BYOK ciphertext stays server-side. Signed-in users could read byok_keys.enc_* through PostgREST and
-- write the encryption columns (ciphertext, IV, tag, key and AAD versions, fingerprint) directly, for
-- example setting enc_aad_version back to 0 so the gateway accepts unbound legacy ciphertext. The API
-- and web-api create, rotate and read these columns with the service role only; no client reads or
-- writes them. Workspace admins keep their existing access to every other column under RLS.
-- phaseo:allow-destructive-migration reason: the only match is the TRUNCATE privilege named in the REVOKE statement below, taken away from anon and authenticated; no table is truncated, nothing is dropped and no data is deleted.

-- Column privileges only apply once the table-wide grants are gone. anon has no byok_keys policies,
-- so it loses nothing it could use; TRUNCATE and friends (TRUNCATE ignores RLS) go with it.
REVOKE ALL ON TABLE "public"."byok_keys" FROM "anon", "authenticated";

GRANT DELETE ON TABLE "public"."byok_keys" TO "authenticated";

-- Every column except the ciphertext and its AAD version.
GRANT SELECT ("allowed_api_key_ids", "allowed_model_slugs", "always_use", "created_at", "created_by", "enabled", "error_message", "fingerprint_sha256", "id", "key_version", "last_used_at", "last_verified_at", "name", "prefix", "provider_id", "routing_mode", "sort_order", "suffix", "verification_status", "workspace_id") ON TABLE "public"."byok_keys" TO "authenticated";

-- Every column except the encryption material, its key and AAD versions, and the fingerprint.
GRANT INSERT ("allowed_api_key_ids", "allowed_model_slugs", "always_use", "created_at", "created_by", "enabled", "error_message", "id", "last_used_at", "last_verified_at", "name", "prefix", "provider_id", "routing_mode", "sort_order", "suffix", "verification_status", "workspace_id") ON TABLE "public"."byok_keys" TO "authenticated";

GRANT UPDATE ("allowed_api_key_ids", "allowed_model_slugs", "always_use", "created_at", "created_by", "enabled", "error_message", "id", "last_used_at", "last_verified_at", "name", "prefix", "provider_id", "routing_mode", "sort_order", "suffix", "verification_status", "workspace_id") ON TABLE "public"."byok_keys" TO "authenticated";

-- The web-api calls this as the signed-in admin. It read whole rows (select *), which needs SELECT on
-- the ciphertext; it now reads only the ordering columns.
CREATE OR REPLACE FUNCTION public.reorder_v2_byok_key (
  p_workspace_id uuid,
  p_key_id       uuid,
  p_direction    text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  current_key record;
  adjacent_key record;
begin
  if p_direction not in ('up', 'down') then
    raise exception using errcode = '22023', message = 'invalid_direction';
  end if;
  if not public.is_workspace_admin(p_workspace_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  select id, workspace_id, provider_id, routing_mode, sort_order, created_at into current_key
  from public.byok_keys
  where id = p_key_id and workspace_id = p_workspace_id
  for update;
  if not found then return false; end if;

  if p_direction = 'up' then
    select id, sort_order into adjacent_key
    from public.byok_keys
    where workspace_id = current_key.workspace_id
      and provider_id = current_key.provider_id
      and routing_mode = current_key.routing_mode
      and (sort_order, created_at, id) < (current_key.sort_order, current_key.created_at, current_key.id)
    order by sort_order desc, created_at desc, id desc
    limit 1
    for update;
  else
    select id, sort_order into adjacent_key
    from public.byok_keys
    where workspace_id = current_key.workspace_id
      and provider_id = current_key.provider_id
      and routing_mode = current_key.routing_mode
      and (sort_order, created_at, id) > (current_key.sort_order, current_key.created_at, current_key.id)
    order by sort_order, created_at, id
    limit 1
    for update;
  end if;
  if not found then return true; end if;

  update public.byok_keys
  set sort_order = case
    when id = current_key.id then adjacent_key.sort_order
    else current_key.sort_order
  end
  where id in (current_key.id, adjacent_key.id);
  return true;
end;
$function$;

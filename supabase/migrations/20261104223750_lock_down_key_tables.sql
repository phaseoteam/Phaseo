-- Security review 2026-11-04: signed-in workspace admins could write API key and management key rows
-- directly through PostgREST, including the columns the gateway uses to decide which key, and so which
-- person, a secret authenticates as (hash, kid, the OAuth-delegated key columns), and could bring revoked
-- management keys back. Phaseo's API and web-api create and change keys with the service role only, so
-- signed-in clients lose every write privilege on both tables and lose read access to the hash column.
-- phaseo:allow-destructive-migration reason: the only match is the TRUNCATE privilege named in REVOKE statements below, taken away from anon; no table is truncated, nothing is dropped and no data is deleted.

-- 1. keys and management_keys: no client writes; members read every column except hash (RLS still
-- limits rows to their workspaces). The member write policies stay but no longer apply without grants.
REVOKE ALL ON TABLE "public"."keys" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."management_keys" FROM "anon", "authenticated";

GRANT SELECT ("created_at", "created_by", "daily_limit_cost_nanos", "daily_limit_requests", "department_id", "expires_at", "id", "ip_allowlist", "issued_via", "key_kind", "kid", "last_used_at", "monthly_limit_cost_nanos", "monthly_limit_requests", "name", "never_store_content", "oauth_client_id", "oauth_resource", "oauth_scopes", "oauth_user_id", "prefix", "revoked_at", "revoked_reason", "scopes", "soft_blocked", "status", "storage_locations", "updated_at", "weekly_limit_cost_nanos", "weekly_limit_requests", "workspace_id") ON TABLE "public"."keys" TO "authenticated";

GRANT SELECT ("created_at", "created_by", "daily_limit_cost_nanos", "daily_limit_requests", "expires_at", "id", "kid", "last_used_at", "monthly_limit_cost_nanos", "monthly_limit_requests", "name", "prefix", "revoked_at", "revoked_reason", "scopes", "soft_blocked", "status", "updated_at", "weekly_limit_cost_nanos", "weekly_limit_requests", "workspace_id") ON TABLE "public"."management_keys" TO "authenticated";

-- 2. A second lock in case a write grant comes back: signed-in clients can't create keys or change the
-- columns that decide who a key authenticates as and what it may do.
CREATE OR REPLACE FUNCTION public.protect_key_identity_columns()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  -- Phaseo's API and web-api create and change keys with the service role. Signed-in clients hold no
  -- write grants on keys or management_keys; this trigger is a second lock in case one comes back.
  -- The gateway finds a key by kid and checks the secret against hash, and an OAuth-delegated key acts
  -- as oauth_user_id, so a client that could set these columns could make a key act as someone else.
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    raise exception 'key_identity_locked'
      using errcode = '42501',
        detail = 'Keys are created through Phaseo''s API, not directly in the database.';
  end if;
  if exists (
    select 1
    from unnest(array[
      'workspace_id', 'hash', 'kid', 'prefix', 'scopes', 'key_kind', 'issued_via',
      'oauth_user_id', 'oauth_client_id', 'oauth_scopes', 'oauth_resource'
    ]) as locked(column_name)
    where (to_jsonb(new) -> locked.column_name) is distinct from (to_jsonb(old) -> locked.column_name)
  ) then
    raise exception 'key_identity_locked'
      using errcode = '42501',
        detail = 'A key''s secret, identity, scopes and OAuth owner are set through Phaseo''s API, not directly in the database.';
  end if;
  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."protect_key_identity_columns"() IS 'Stops signed-in clients from creating keys or management keys directly, or changing the columns that decide who a key authenticates as and what it may do (hash, kid, scopes, workspace, OAuth owner).';

REVOKE ALL ON FUNCTION "public"."protect_key_identity_columns"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_key_identity_columns"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."protect_key_identity_columns"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE TRIGGER protect_key_identity_columns
  BEFORE INSERT OR UPDATE ON public.keys
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_key_identity_columns();

CREATE TRIGGER protect_management_key_identity_columns
  BEFORE INSERT OR UPDATE ON public.management_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_key_identity_columns();

-- 3. Revoked, compromised and deleted management keys stay out of service, like API keys. This applies to
-- the service role too, so pausing and resuming through the API can't bring one back either.
CREATE TRIGGER protect_revoked_management_key_status
  BEFORE UPDATE OF status ON public.management_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_revoked_key_status();


-- 4. Hygiene. Workspaces and accounts are deleted through web-api and the API (which refuse the personal
-- workspace, clean up members and run the account deletion job) with the service role, never directly.
REVOKE DELETE ON TABLE "public"."workspaces" FROM "anon", "authenticated";

REVOKE DELETE ON TABLE "public"."users" FROM "anon", "authenticated";

-- Only the service role reads or writes provider events (every policy is for service_role).
REVOKE ALL ON TABLE "public"."gateway_provider_events" FROM "anon", "authenticated";

-- anon never writes wallet reservations (RLS already refused every row).
REVOKE DELETE, INSERT, TRUNCATE, UPDATE ON TABLE "public"."gateway_wallet_reservations" FROM "anon";

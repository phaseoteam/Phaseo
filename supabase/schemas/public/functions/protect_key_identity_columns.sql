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

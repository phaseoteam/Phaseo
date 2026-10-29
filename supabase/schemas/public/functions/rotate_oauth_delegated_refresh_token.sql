CREATE OR REPLACE FUNCTION public.rotate_oauth_delegated_refresh_token (
  p_current_token_hash text,
  p_next_token_hash    text,
  p_next_expires_at    timestamp with time zone,
  p_key_hash           text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  token_identity public.oauth_refresh_tokens%rowtype;
  current_token public.oauth_refresh_tokens%rowtype;
  delegated_key public.keys%rowtype;
  granted_scopes text[];
  resource_is_gateway boolean;
  key_expires_at timestamp with time zone := now() + interval '7 days';
begin
  if nullif(btrim(p_next_token_hash), '') is null or nullif(btrim(p_key_hash), '') is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Read identity without a row lock, then lock in the member-delete trigger's order:
  -- membership -> authorization -> key -> token.
  select * into token_identity
  from public.oauth_refresh_tokens
  where token_hash = p_current_token_hash;

  if not found or token_identity.key_id is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform 1
  from public.workspace_members member
  where member.user_id = token_identity.user_id
    and member.workspace_id = token_identity.workspace_id
  for key share;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select authorization_row.scopes into granted_scopes
  from public.oauth_authorizations authorization_row
  where authorization_row.user_id = token_identity.user_id
    and authorization_row.workspace_id = token_identity.workspace_id
    and authorization_row.client_id = token_identity.client_id
    and authorization_row.revoked_at is null
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  select * into delegated_key
  from public.keys key_row
  where key_row.id = token_identity.key_id
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Re-read and validate after acquiring locks because another rotation may
  -- have changed this token between the initial identity read and this lock.
  select * into current_token
  from public.oauth_refresh_tokens
  where token_hash = p_current_token_hash
  for update;

  if not found
    or current_token.user_id <> token_identity.user_id
    or current_token.workspace_id <> token_identity.workspace_id
    or current_token.client_id <> token_identity.client_id
    or current_token.key_id is distinct from token_identity.key_id then
    return jsonb_build_object('status', 'invalid');
  end if;

  if current_token.revoked_at is not null then
    update public.oauth_refresh_tokens
    set revoked_at = coalesce(revoked_at, now())
    where family_id = current_token.family_id;

    -- Presented again after it was rotated (only rotation sets last_used_at), the token may
    -- have leaked: end the key it renews too, even a paused one, so turning it back on can't
    -- revive it. A token revoked any other way just fails.
    if current_token.last_used_at is not null then
      update public.keys
      set status = 'revoked', revoked_reason = 'oauth_refresh_token_reused'
      where id = delegated_key.id
        and status not in ('revoked', 'compromised', 'deleted');
      return jsonb_build_object('status', 'reused');
    end if;
    return jsonb_build_object('status', 'invalid');
  end if;

  if current_token.expires_at is not null and current_token.expires_at <= now() then
    update public.oauth_refresh_tokens set revoked_at = now() where id = current_token.id;
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Revoking, disabling or deleting the key ends its refresh tokens; a refresh never revives it.
  if delegated_key.status <> 'active'
    or delegated_key.key_kind <> 'oauth_delegated'
    or delegated_key.oauth_user_id is distinct from current_token.user_id
    or delegated_key.workspace_id <> current_token.workspace_id
    or delegated_key.oauth_client_id is distinct from current_token.client_id then
    update public.oauth_refresh_tokens
    set revoked_at = coalesce(revoked_at, now())
    where family_id = current_token.family_id;
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Never widen on refresh: keep the scopes this token and its key already hold that the
  -- authorization still grants.
  granted_scopes := array(
    select scope from unnest(coalesce(granted_scopes, array[]::text[])) as scope
    where scope = any(current_token.scopes)
      and scope = any(coalesce(delegated_key.oauth_scopes, array[]::text[]))
  );

  resource_is_gateway := coalesce(
    btrim(delegated_key.oauth_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$',
    false
  );

  -- An unbound or Gateway-bound key spends credits, so it needs gateway:access consent. Losing a
  -- required scope ends the chain for good, so consenting to the scope again doesn't revive it.
  if coalesce(cardinality(granted_scopes), 0) = 0
    or (
      (nullif(btrim(delegated_key.oauth_resource), '') is null or resource_is_gateway)
      and not (granted_scopes @> array['gateway:access']::text[])
    ) then
    update public.oauth_refresh_tokens
    set revoked_at = coalesce(revoked_at, now())
    where family_id = current_token.family_id;
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.oauth_refresh_tokens
  set revoked_at = now(), last_used_at = now()
  where id = current_token.id;

  insert into public.oauth_refresh_tokens (
    token_hash, user_id, workspace_id, client_id, scopes, expires_at,
    rotated_from, family_id, key_id
  ) values (
    p_next_token_hash, current_token.user_id, current_token.workspace_id,
    current_token.client_id, granted_scopes, p_next_expires_at,
    current_token.id, current_token.family_id, current_token.key_id
  );

  -- Same key row, new secret: the previous access token stops working now, and the key's
  -- limits, history and Settings entry carry over.
  update public.keys
  set hash = p_key_hash,
    oauth_scopes = granted_scopes,
    expires_at = key_expires_at
  where id = delegated_key.id;

  return jsonb_build_object(
    'status', 'rotated',
    'kid', delegated_key.kid,
    'scopes', to_jsonb(granted_scopes),
    'resource', delegated_key.oauth_resource,
    'expires_at', key_expires_at
  );
end;
$function$;

COMMENT ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) IS 'Refreshes a third-party app''s delegated gateway key: rotates the refresh token and replaces the same key''s secret, extending it 7 days. Scopes only narrow, and losing a required scope ends the chain. A reused refresh token revokes its chain and the key. Returns {status: rotated|reused|invalid, ...}.';

GRANT EXECUTE ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text) TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."rotate_oauth_delegated_refresh_token"(text, text, timestamp WITH time zone, text)
  FROM PUBLIC, "anon", "authenticated";

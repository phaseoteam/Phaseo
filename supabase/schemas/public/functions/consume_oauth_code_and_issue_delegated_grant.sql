CREATE OR REPLACE FUNCTION public.consume_oauth_code_and_issue_delegated_grant (
  p_code_id              uuid,
  p_key_hash             text,
  p_key_kid              text,
  p_key_prefix           text,
  p_key_name             text,
  p_user_id              uuid,
  p_workspace_id         uuid,
  p_client_id            text,
  p_scopes               text[],
  p_resource             text,
  p_refresh_token_hash   text,
  p_refresh_expires_at   timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  granted_scopes text[];
  granted_resource text;
  resource_is_gateway boolean;
  existing_key public.keys%rowtype;
  issued_key_id uuid;
  issued_kid text;
  outcome text;
begin
  if nullif(btrim(p_refresh_token_hash), '') is null or p_refresh_expires_at is null then
    return jsonb_build_object('status', 'invalid');
  end if;

  resource_is_gateway := coalesce(
    btrim(p_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$',
    false
  );

  -- Unbound and Gateway-bound credentials both authorize billable API use.
  if (nullif(btrim(p_resource), '') is null or resource_is_gateway)
    and not (coalesce(p_scopes, array[]::text[]) @> array['gateway:access']::text[])
  then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Lock order, as in both refresh-token rotations, revoke_oauth_refresh_token_grant and the
  -- member-delete trigger: membership -> authorization -> key -> refresh tokens.
  perform 1
  from public.workspace_members member
  where member.user_id = p_user_id
    and member.workspace_id = p_workspace_id
  for key share;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  perform 1
  from public.oauth_authorizations authorization_row
  where authorization_row.user_id = p_user_id
    and authorization_row.workspace_id = p_workspace_id
    and authorization_row.client_id = p_client_id
    and authorization_row.revoked_at is null
    and coalesce(authorization_row.scopes, array[]::text[]) @> coalesce(p_scopes, array[]::text[])
    and (
      (nullif(btrim(p_resource), '') is not null and not resource_is_gateway)
      or coalesce(authorization_row.scopes, array[]::text[]) @> array['gateway:access']::text[]
    )
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.oauth_authorization_codes authorization_code
  set used_at = now()
  where authorization_code.id = p_code_id
    and authorization_code.used_at is null
    and authorization_code.expires_at > now()
    and authorization_code.user_id = p_user_id
    and authorization_code.workspace_id = p_workspace_id
    and authorization_code.client_id = p_client_id
    and authorization_code.resource is not distinct from nullif(btrim(p_resource), '')
    and (
      (authorization_code.resource is not null and not resource_is_gateway)
      or coalesce(authorization_code.scopes, array[]::text[]) @> array['gateway:access']::text[]
    )
    and coalesce(authorization_code.scopes, array[]::text[]) <@ coalesce(p_scopes, array[]::text[])
    and coalesce(p_scopes, array[]::text[]) <@ coalesce(authorization_code.scopes, array[]::text[])
  returning authorization_code.scopes, authorization_code.resource
    into granted_scopes, granted_resource;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  -- Approving the same app again renews its key instead of adding one, so the key keeps its id,
  -- limits, month-to-date spend and history. Revoked, compromised and deleted keys are final.
  select * into existing_key
  from public.keys key_row
  where key_row.key_kind = 'oauth_delegated'
    and key_row.issued_via = 'oauth_pkce'
    and key_row.oauth_user_id = p_user_id
    and key_row.workspace_id = p_workspace_id
    and key_row.oauth_client_id = p_client_id
    and key_row.oauth_resource is not distinct from granted_resource
    and key_row.status not in ('revoked', 'compromised', 'deleted')
  order by (key_row.status = 'active') desc, key_row.created_at desc
  limit 1
  for update;

  if found then
    -- A key an owner or admin paused (or a storage incident paused) is never turned back on by
    -- signing in again. The code is spent; nothing usable is issued.
    if existing_key.status <> 'active' then
      return jsonb_build_object('status', 'key_inactive');
    end if;

    -- Every earlier sign-in's refresh-token family is retired here, spent tokens included, and the
    -- new secret ends its access token. Presenting a retired token later is just refused, never
    -- treated as reuse, so it can't end this key or the family issued below.
    update public.oauth_refresh_tokens
    set revoked_at = coalesce(revoked_at, now()), revoked_reason = 'superseded'
    where key_id = existing_key.id
      and revoked_reason is null;

    update public.keys
    set hash = p_key_hash,
      oauth_scopes = granted_scopes,
      expires_at = now() + interval '7 days'
    where id = existing_key.id;

    issued_key_id := existing_key.id;
    issued_kid := existing_key.kid;
    outcome := 'renewed';
  else
    insert into public.keys (
      workspace_id, name, hash, prefix, status, scopes, created_by, kid,
      key_kind, oauth_client_id, oauth_user_id, oauth_scopes, oauth_resource, issued_via, expires_at
    ) values (
      p_workspace_id, p_key_name, p_key_hash, p_key_prefix, 'active', '[]', p_user_id, p_key_kid,
      'oauth_delegated', p_client_id, p_user_id, granted_scopes, granted_resource, 'oauth_pkce', now() + interval '7 days'
    )
    returning id, kid into issued_key_id, issued_kid;
    outcome := 'issued';
  end if;

  -- The refresh token renews this key (same row, new secret) until it is revoked or unused for 90 days.
  insert into public.oauth_refresh_tokens (
    token_hash, user_id, workspace_id, client_id, scopes, expires_at, family_id, key_id
  ) values (
    p_refresh_token_hash, p_user_id, p_workspace_id, p_client_id, granted_scopes, p_refresh_expires_at,
    gen_random_uuid(), issued_key_id
  );

  return jsonb_build_object('status', outcome, 'kid', issued_kid);
end;
$function$;

COMMENT ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) IS 'Exchanges a third-party OAuth authorization code for a delegated gateway key (the access token, 7 days) and a refresh token bound to that key (90 days, rotated by rotate_oauth_delegated_refresh_token), in one transaction. Approving the same app again renews its existing key (same row, new secret, new refresh-token family) instead of adding one, retires the earlier families (revoked_reason superseded), and never turns a paused key back on. Returns {status: issued|renewed|key_inactive|invalid, kid}.';

GRANT EXECUTE ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone)
  FROM PUBLIC, "anon", "authenticated";

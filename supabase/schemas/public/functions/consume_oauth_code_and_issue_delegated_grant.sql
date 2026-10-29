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
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  granted_scopes text[];
  granted_resource text;
  resource_is_gateway boolean;
  issued_key_id uuid;
begin
  if nullif(btrim(p_refresh_token_hash), '') is null or p_refresh_expires_at is null then
    return 'invalid';
  end if;

  resource_is_gateway := coalesce(
    btrim(p_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$',
    false
  );

  -- Unbound and Gateway-bound credentials both authorize billable API use.
  if (nullif(btrim(p_resource), '') is null or resource_is_gateway)
    and not (coalesce(p_scopes, array[]::text[]) @> array['gateway:access']::text[])
  then
    return 'invalid';
  end if;

  perform 1
  from public.workspace_members member
  where member.user_id = p_user_id
    and member.workspace_id = p_workspace_id
  for key share;

  if not found then
    return 'invalid';
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
    return 'invalid';
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
    return 'invalid';
  end if;

  -- The new sign-in replaces the app's earlier key here; revoking it also ends that key's
  -- refresh tokens (revoke_oauth_refresh_tokens_for_inactive_key).
  update public.keys
  set status = 'revoked'
  where key_kind = 'oauth_delegated'
    and oauth_user_id = p_user_id
    and workspace_id = p_workspace_id
    and oauth_client_id = p_client_id
    and oauth_resource is not distinct from granted_resource
    and status = 'active';

  insert into public.keys (
    workspace_id, name, hash, prefix, status, scopes, created_by, kid,
    key_kind, oauth_client_id, oauth_user_id, oauth_scopes, oauth_resource, issued_via, expires_at
  ) values (
    p_workspace_id, p_key_name, p_key_hash, p_key_prefix, 'active', '[]', p_user_id, p_key_kid,
    'oauth_delegated', p_client_id, p_user_id, granted_scopes, granted_resource, 'oauth_pkce', now() + interval '7 days'
  )
  returning id into issued_key_id;

  -- The refresh token renews this key (same row, new secret) until it is revoked or unused for 90 days.
  insert into public.oauth_refresh_tokens (
    token_hash, user_id, workspace_id, client_id, scopes, expires_at, family_id, key_id
  ) values (
    p_refresh_token_hash, p_user_id, p_workspace_id, p_client_id, granted_scopes, p_refresh_expires_at,
    gen_random_uuid(), issued_key_id
  );

  return 'issued';
end;
$function$;

COMMENT ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) IS 'Exchanges a third-party OAuth authorization code for a delegated gateway key (the access token, 7 days) and a refresh token bound to that key (90 days, rotated by rotate_oauth_delegated_refresh_token), in one transaction. Returns issued or invalid.';

GRANT EXECUTE ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone) TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."consume_oauth_code_and_issue_delegated_grant"(uuid, text, text, text, text, uuid, uuid, text, text[], text, text, timestamp WITH time zone)
  FROM PUBLIC, "anon", "authenticated";

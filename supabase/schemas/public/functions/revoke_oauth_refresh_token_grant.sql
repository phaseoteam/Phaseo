CREATE OR REPLACE FUNCTION public.revoke_oauth_refresh_token_grant (
  p_token_hashes text[]
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  token_identity public.oauth_refresh_tokens%rowtype;
  current_token public.oauth_refresh_tokens%rowtype;
begin
  -- Any token of the grant identifies it, even one already rotated, so a logout that races a
  -- refresh still ends the token that refresh issued. Read it without a row lock.
  select * into token_identity
  from public.oauth_refresh_tokens
  where token_hash = any(coalesce(p_token_hashes, array[]::text[]))
  limit 1;

  if not found then
    return 'not_found';
  end if;

  -- Lock in the order every OAuth grant change uses (the member-delete trigger, the code exchange,
  -- both refresh-token rotations): membership -> authorization -> key -> refresh tokens. Holding
  -- the authorization first waits out any refresh, renewal or replay of this grant in flight, so
  -- this never holds a token lock one of them is waiting for, and the updates below see the
  -- tokens it committed.
  perform 1
  from public.workspace_members member
  where member.user_id = token_identity.user_id
    and member.workspace_id = token_identity.workspace_id
  for key share;

  perform 1
  from public.oauth_authorizations authorization_row
  where authorization_row.user_id = token_identity.user_id
    and authorization_row.workspace_id = token_identity.workspace_id
    and authorization_row.client_id = token_identity.client_id
  for update;

  if token_identity.key_id is null then
    update public.oauth_refresh_tokens
    set revoked_at = now()
    where family_id = token_identity.family_id
      and revoked_at is null;
    return 'revoked';
  end if;

  perform 1
  from public.keys key_row
  where key_row.id = token_identity.key_id
  for update;

  select * into current_token
  from public.oauth_refresh_tokens
  where id = token_identity.id;

  -- Approving the app again retired this token's family and renewed the key with a new one. That
  -- sign-in is already over, and its token doesn't speak for the one that replaced it.
  if not found or current_token.revoked_reason = 'superseded' then
    return 'revoked';
  end if;

  update public.oauth_refresh_tokens
  set revoked_at = now()
  where (key_id = token_identity.key_id or family_id = token_identity.family_id)
    and revoked_at is null;

  -- The app gave up its access: end its delegated key too, even a paused one.
  update public.keys
  set status = 'revoked', revoked_reason = 'oauth_token_revoked'
  where id = token_identity.key_id
    and key_kind = 'oauth_delegated'
    and status not in ('revoked', 'compromised', 'deleted');

  return 'revoked';
end;
$function$;

COMMENT ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) IS 'RFC 7009 revocation of an OAuth refresh token, in one transaction: revokes the token''s whole family and, for a third-party app''s token, its delegated gateway key and every refresh token bound to it. Matches a token even if it was already rotated; a token from a family that re-approving the app superseded revokes nothing more. Locks the authorization before any key or token, like the rotations. Returns revoked or not_found.';

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[])
  FROM PUBLIC, "anon", "authenticated";

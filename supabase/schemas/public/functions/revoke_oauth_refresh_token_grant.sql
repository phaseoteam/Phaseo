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
begin
  -- Any token of the grant identifies it, even one already rotated, so a logout that races a
  -- refresh still ends the token that refresh issued.
  select * into token_identity
  from public.oauth_refresh_tokens
  where token_hash = any(coalesce(p_token_hashes, array[]::text[]))
  limit 1;

  if not found then
    return 'not_found';
  end if;

  if token_identity.key_id is null then
    -- Wait for a refresh in flight, so the update below also sees the token it issues.
    perform 1
    from public.oauth_refresh_tokens
    where family_id = token_identity.family_id
    for update;

    update public.oauth_refresh_tokens
    set revoked_at = now()
    where family_id = token_identity.family_id
      and revoked_at is null;
    return 'revoked';
  end if;

  -- Same order as rotate_oauth_delegated_refresh_token: key -> refresh tokens.
  perform 1
  from public.keys key_row
  where key_row.id = token_identity.key_id
  for update;

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

COMMENT ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) IS 'RFC 7009 revocation of an OAuth refresh token, in one transaction: revokes the token''s whole family and, for a third-party app''s token, its delegated gateway key and every refresh token bound to it. Matches a token even if it was already rotated. Returns revoked or not_found.';

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) TO "service_role";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[]) TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."revoke_oauth_refresh_token_grant"(text[])
  FROM PUBLIC, "anon", "authenticated";

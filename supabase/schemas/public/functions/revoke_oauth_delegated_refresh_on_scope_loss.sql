CREATE OR REPLACE FUNCTION public.revoke_oauth_delegated_refresh_on_scope_loss()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Runs while this update holds the authorization row, which a refresh locks first, so no refresh
  -- can slip in between. Same order as consent revocation: authorization -> keys -> refresh tokens.
  --
  -- Without gateway:access, a credit-spending key (unbound, or bound to the Gateway) is revoked
  -- outright, paused and disabled ones included, so its current access token stops spending too and
  -- granting the scope again never revives it. Keys bound to another resource don't spend credits.
  if not (coalesce(new.scopes, array[]::text[]) @> array['gateway:access']::text[]) then
    update public.keys key_row
    set status = 'revoked'
    where key_row.key_kind = 'oauth_delegated'
      and key_row.oauth_user_id = new.user_id
      and key_row.workspace_id = new.workspace_id
      and key_row.oauth_client_id = new.client_id
      and key_row.status not in ('revoked', 'compromised', 'deleted')
      and (
        nullif(btrim(key_row.oauth_resource), '') is null
        or coalesce(btrim(key_row.oauth_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$', false)
      );
  end if;

  -- The same test as rotate_oauth_delegated_refresh_token: nothing left in common, or a
  -- credit-spending key without gateway:access, ends the token's chain for good.
  update public.oauth_refresh_tokens refresh_token
  set revoked_at = now()
  from public.keys key_row
  where key_row.id = refresh_token.key_id
    and refresh_token.user_id = new.user_id
    and refresh_token.workspace_id = new.workspace_id
    and refresh_token.client_id = new.client_id
    and refresh_token.revoked_at is null
    and (
      not exists (
        select 1
        from unnest(coalesce(new.scopes, array[]::text[])) as scope
        where scope = any(refresh_token.scopes)
          and scope = any(coalesce(key_row.oauth_scopes, array[]::text[]))
      )
      or (
        (
          nullif(btrim(key_row.oauth_resource), '') is null
          or coalesce(btrim(key_row.oauth_resource) ~* '^https://api\.phaseo\.app(?::443)?/v1/*$', false)
        )
        and not (coalesce(new.scopes, array[]::text[]) @> array['gateway:access']::text[])
      )
    );

  return null;
end;
$function$;

COMMENT ON FUNCTION "public"."revoke_oauth_delegated_refresh_on_scope_loss"() IS 'When an app''s authorization loses a scope its delegated keys need, ends those keys'' refresh tokens (every scope a token holds gone, or gateway:access gone for a credit-spending key), and without gateway:access revokes its credit-spending keys too, so granting the scope again later never revives them.';

REVOKE ALL ON FUNCTION "public"."revoke_oauth_delegated_refresh_on_scope_loss"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_delegated_refresh_on_scope_loss"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_delegated_refresh_on_scope_loss"() FROM PUBLIC, "anon", "authenticated", "service_role";

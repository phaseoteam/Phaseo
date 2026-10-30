CREATE OR REPLACE FUNCTION public.revoke_oauth_grant_on_authorization_revoke()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Same order as the member-delete trigger: authorization -> keys -> refresh tokens. Paused and
  -- disabled keys are revoked too, so turning one back on can't bring back the app's access.
  update public.keys
  set status = 'revoked'
  where key_kind = 'oauth_delegated'
    and oauth_user_id = old.user_id
    and workspace_id = old.workspace_id
    and oauth_client_id = old.client_id
    and status not in ('revoked', 'compromised', 'deleted');

  update public.oauth_refresh_tokens
  set revoked_at = coalesce(revoked_at, now())
  where user_id = old.user_id
    and workspace_id = old.workspace_id
    and client_id = old.client_id
    and revoked_at is null;

  return null;
end;
$function$;

COMMENT ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() IS 'When someone revokes or deletes an app''s authorization, revokes that app''s delegated keys and refresh tokens in the workspace, so authorizing the app again later never revives them.';

REVOKE ALL ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_grant_on_authorization_revoke"() FROM PUBLIC, "anon", "authenticated", "service_role";

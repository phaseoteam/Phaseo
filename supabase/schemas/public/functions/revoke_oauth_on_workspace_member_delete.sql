CREATE OR REPLACE FUNCTION public.revoke_oauth_on_workspace_member_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.oauth_authorizations
  set revoked_at = coalesce(revoked_at, now())
  where user_id = old.user_id
    and workspace_id = old.workspace_id
    and revoked_at is null;

  update public.oauth_refresh_tokens
  set revoked_at = coalesce(revoked_at, now())
  where user_id = old.user_id
    and workspace_id = old.workspace_id
    and revoked_at is null;

  -- Paused and disabled keys are revoked too, so nobody left can turn them back on.
  update public.keys
  set status = 'revoked',
    revoked_reason = coalesce(revoked_reason, 'member_removed')
  where workspace_id = old.workspace_id
    and created_by = old.user_id
    and status not in ('revoked', 'compromised', 'deleted');

  update public.management_keys
  set status = 'revoked',
    revoked_at = coalesce(revoked_at, now()),
    revoked_reason = coalesce(revoked_reason, 'member_removed')
  where workspace_id = old.workspace_id
    and created_by = old.user_id
    and status not in ('revoked', 'compromised', 'deleted');

  return old;
end;
$function$;

COMMENT ON FUNCTION "public"."revoke_oauth_on_workspace_member_delete"() IS 'When someone stops being a workspace member, revokes their OAuth grants and refresh tokens there and the API keys and management keys they created there.';

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_on_workspace_member_delete"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_on_workspace_member_delete"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_on_workspace_member_delete"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_on_workspace_member_delete"() FROM PUBLIC, "anon", "authenticated";

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

  return old;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_on_workspace_member_delete"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_on_workspace_member_delete"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_on_workspace_member_delete"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_on_workspace_member_delete"() FROM PUBLIC, "anon", "authenticated";

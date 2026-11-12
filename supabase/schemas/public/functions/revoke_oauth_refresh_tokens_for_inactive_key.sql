CREATE OR REPLACE FUNCTION public.revoke_oauth_refresh_tokens_for_inactive_key()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.oauth_refresh_tokens
  set revoked_at = coalesce(revoked_at, now())
  where key_id = new.id
    and revoked_at is null;

  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() IS 'Ends the refresh tokens of a delegated OAuth key once it is revoked, disabled, paused or deleted, so the app cannot renew it. Turning the key back on does not revive them.';

REVOKE ALL ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."revoke_oauth_refresh_tokens_for_inactive_key"() FROM PUBLIC, "anon", "authenticated", "service_role";

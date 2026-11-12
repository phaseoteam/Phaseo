CREATE OR REPLACE FUNCTION public.slack_apps_reset_verification()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  -- Verification proves ownership of one Slack app id and client id; a row saved with another app
  -- is unverified until an install through it succeeds again, whichever code path saved it.
  if NEW.slack_app_id is distinct from OLD.slack_app_id or NEW.client_id is distinct from OLD.client_id then
    NEW.verified_at := null;
  end if;
  return NEW;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."slack_apps_reset_verification"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."slack_apps_reset_verification"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."slack_apps_reset_verification"() FROM PUBLIC, "anon", "authenticated", "service_role";

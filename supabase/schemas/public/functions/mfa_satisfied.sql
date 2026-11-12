CREATE OR REPLACE FUNCTION public.mfa_satisfied ()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1
      from auth.mfa_factors f
      where f.user_id = auth.uid()
        and f.status = 'verified'
    );
$function$;

COMMENT ON FUNCTION "public"."mfa_satisfied"() IS 'True when the signed-in session has passed MFA (aal2), or the user has no verified second factor. Restrictive RLS policies use it so a password-only session of an MFA-protected account cannot use the Data API.';

GRANT EXECUTE ON FUNCTION "public"."mfa_satisfied"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."mfa_satisfied"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."mfa_satisfied"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mfa_satisfied"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."mfa_satisfied"() FROM PUBLIC, "anon";

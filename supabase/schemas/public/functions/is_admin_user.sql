CREATE OR REPLACE FUNCTION public.is_admin_user()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.users u
    where u.user_id = auth.uid()
      and lower(coalesce(u.role::text, '')) = 'admin'
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."is_admin_user"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."is_admin_user"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_admin_user"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin_user"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."is_admin_user"() FROM PUBLIC, "anon";

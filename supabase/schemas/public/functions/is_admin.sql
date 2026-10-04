CREATE OR REPLACE FUNCTION public.is_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists (
    select 1
    from public.users u
    where u.user_id = auth.uid()
      and u.role = 'admin'::public.user_role
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_admin"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC, "anon", "authenticated";

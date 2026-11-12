CREATE OR REPLACE FUNCTION public.protect_users_global_role()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $function$
begin
  if auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and new.role is distinct from old.role then
    raise exception 'users.role is managed by administrators'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."protect_users_global_role"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_users_global_role"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."protect_users_global_role"() FROM PUBLIC, "anon", "authenticated", "service_role";

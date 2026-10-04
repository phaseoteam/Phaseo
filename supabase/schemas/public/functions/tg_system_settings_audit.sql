CREATE OR REPLACE FUNCTION public.tg_system_settings_audit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  new.updated_at := timezone('utc', now());
  new.updated_by := auth.uid(); -- will be NULL for non-authenticated contexts (e.g. migrations)
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."tg_system_settings_audit"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."tg_system_settings_audit"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."tg_system_settings_audit"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."tg_system_settings_audit"() FROM PUBLIC, "anon", "authenticated";

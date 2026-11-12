CREATE OR REPLACE FUNCTION public.ensure_workspace_settings_row()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
  AS $function$
begin
  insert into public.workspace_settings (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."ensure_workspace_settings_row"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."ensure_workspace_settings_row"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."ensure_workspace_settings_row"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.cleanup_dormant_enterprise_workspaces()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  return jsonb_build_object(
    'total_teams_checked', 0,
    'teams_downgraded', 0,
    'downgraded_teams', '[]'::jsonb,
    'processed_at', now()
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."cleanup_dormant_enterprise_workspaces"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_dormant_enterprise_workspaces"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."cleanup_dormant_enterprise_workspaces"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."cleanup_dormant_enterprise_workspaces"() FROM PUBLIC, "anon", "authenticated";

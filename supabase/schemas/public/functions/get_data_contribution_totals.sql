CREATE OR REPLACE FUNCTION public.get_data_contribution_totals (
  p_workspace_id uuid,
  p_since        timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'contributions', count(*),
    'discount_nanos', coalesce(sum(contribution.discount_nanos), 0)
  )
  from public.data_contributions contribution
  where contribution.workspace_id = p_workspace_id
    and contribution.created_at >= p_since;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_data_contribution_totals"(uuid, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_data_contribution_totals"(uuid, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_data_contribution_totals"(uuid, timestamp WITH time zone) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_data_contribution_totals"(uuid, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";

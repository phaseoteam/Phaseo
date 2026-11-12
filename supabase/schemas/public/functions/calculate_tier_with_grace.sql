CREATE OR REPLACE FUNCTION public.calculate_tier_with_grace (
  p_workspace_id    uuid,
  p_spend_30d_nanos bigint
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  perform p_workspace_id;
  perform p_spend_30d_nanos;
  return 'basic';
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."calculate_tier_with_grace"(uuid, bigint) TO "service_role";

REVOKE ALL ON FUNCTION "public"."calculate_tier_with_grace"(uuid, bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."calculate_tier_with_grace"(uuid, bigint) TO "postgres";

REVOKE ALL ON FUNCTION "public"."calculate_tier_with_grace"(uuid, bigint) FROM PUBLIC, "anon", "authenticated";

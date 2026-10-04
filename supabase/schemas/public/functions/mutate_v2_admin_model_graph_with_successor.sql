CREATE OR REPLACE FUNCTION public.mutate_v2_admin_model_graph_with_successor (
  p_actor_user_id uuid,
  p_model_slug    text,
  p_payload       jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_result jsonb;
begin
  v_result := public.mutate_v2_admin_model_graph(p_actor_user_id, p_model_slug, p_payload);
  if p_payload ? 'replacement_model_id' then
    perform public.set_v2_model_recommended_successor(p_actor_user_id, p_model_slug, p_payload->>'replacement_model_id');
  end if;
  return v_result;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_model_graph_with_successor"(uuid, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_model_graph_with_successor"(uuid, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_model_graph_with_successor"(uuid, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_model_graph_with_successor"(uuid, text, jsonb) FROM PUBLIC, "anon", "authenticated";

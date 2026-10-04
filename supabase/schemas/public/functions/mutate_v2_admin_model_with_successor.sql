CREATE OR REPLACE FUNCTION public.mutate_v2_admin_model_with_successor (
  p_actor_user_id uuid,
  p_action        text,
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
  v_result := public.mutate_v2_admin_catalogue(p_actor_user_id, 'models', p_action, p_model_slug, p_payload);
  if p_payload ? 'replacementModelId' then
    perform public.set_v2_model_recommended_successor(p_actor_user_id, p_model_slug, p_payload->>'replacementModelId');
  end if;
  return v_result;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_model_with_successor"(uuid, text, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_model_with_successor"(uuid, text, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_model_with_successor"(uuid, text, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_model_with_successor"(uuid, text, text, jsonb) FROM PUBLIC, "anon", "authenticated";

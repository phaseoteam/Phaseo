CREATE OR REPLACE FUNCTION public.mutate_v2_admin_model_graph_editable (
  p_actor_user_id uuid,
  p_model_slug    text,
  p_payload       jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_graph_payload jsonb := coalesce(p_payload, '{}'::jsonb) - 'provider_models' - 'provider_capabilities';
  v_result jsonb;
begin
  v_result := public.mutate_v2_admin_model_graph_with_successor(
    p_actor_user_id,
    p_model_slug,
    v_graph_payload
  );

  if p_payload ? 'provider_models' or p_payload ? 'provider_capabilities' then
    -- Older graph functions do not set the history actor themselves.
    perform set_config('phaseo.catalogue_actor', p_actor_user_id::text, true);
  end if;

  if p_payload ? 'provider_models' then
    perform catalogue_private.apply_v2_admin_model_provider_routes(
      p_actor_user_id,
      p_model_slug,
      p_payload->'provider_models'
    );
  end if;

  if p_payload ? 'provider_capabilities' then
    perform catalogue_private.apply_v2_admin_model_capabilities(
      p_actor_user_id,
      p_model_slug,
      p_payload->'provider_capabilities'
    );
  end if;

  return v_result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_model_graph_editable"(uuid, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_model_graph_editable"(uuid, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mutate_v2_admin_model_graph_editable"(uuid, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mutate_v2_admin_model_graph_editable"(uuid, text, jsonb) FROM PUBLIC, "anon", "authenticated";

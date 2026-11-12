CREATE OR REPLACE FUNCTION public.set_v2_model_recommended_successor (
  p_actor_user_id          uuid,
  p_model_slug             text,
  p_replacement_model_slug text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_replacement_slug text := nullif(trim(coalesce(p_replacement_model_slug, '')), '');
begin
  if not exists (
    select 1 from public.users
    where user_id = p_actor_user_id
      and lower(coalesce(role::text, '')) = 'admin'
  ) then
    raise exception 'actor must have the admin role';
  end if;

  if v_replacement_slug = p_model_slug then
    raise exception 'recommended successor cannot be the same model';
  end if;

  if v_replacement_slug is not null and not exists (
    select 1 from public.v2_models where model_slug = v_replacement_slug
  ) then
    raise exception 'recommended successor model not found';
  end if;

  select to_jsonb(model) into v_before
  from public.v2_models model
  where model.model_slug = p_model_slug
  for update;

  if v_before is null then
    raise exception 'model not found';
  end if;

  update public.v2_models
  set replacement_model_slug = v_replacement_slug,
      updated_at = now()
  where model_slug = p_model_slug;

  select to_jsonb(model) into v_after
  from public.v2_models model
  where model.model_slug = p_model_slug;

  insert into public.v2_catalogue_admin_changes(
    actor_user_id, resource_type, resource_id, action, before_state, after_state
  ) values (
    p_actor_user_id, 'model_graph', p_model_slug, 'save', v_before, v_after
  );

  return jsonb_build_object('before', v_before, 'after', v_after);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_v2_model_recommended_successor"(uuid, text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_v2_model_recommended_successor"(uuid, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_v2_model_recommended_successor"(uuid, text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_v2_model_recommended_successor"(uuid, text, text) FROM PUBLIC, "anon", "authenticated";

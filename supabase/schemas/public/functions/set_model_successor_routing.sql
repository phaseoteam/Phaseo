CREATE OR REPLACE FUNCTION public.set_model_successor_routing (
  p_actor_user_id      uuid,
  p_model_slug         text,
  p_enabled            boolean,
  p_allow_incompatible boolean DEFAULT false,
  p_notes              text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_before jsonb; v_current jsonb; v_compatibility jsonb; v_successor text;
begin
  if not exists(select 1 from public.users where user_id=p_actor_user_id and lower(coalesce(role::text,''))='admin') then raise exception 'actor must have the admin role'; end if;
  perform 1 from public.v2_models where model_slug=p_model_slug for update;
  if not found then raise exception 'model % does not exist', p_model_slug; end if;

  v_before := public.get_model_successor_routing(p_model_slug);
  if p_enabled then
    v_successor := v_before->>'replacement_model_slug';
    v_compatibility := v_before->'compatibility';
    if v_successor is null or v_compatibility is null or jsonb_typeof(v_compatibility) <> 'object' then
      raise exception 'Set a replacement model before approving successor routing.';
    end if;
    if jsonb_array_length(v_compatibility->'blocking') > 0 then
      raise exception 'Successor % cannot be approved: %', v_successor, (select string_agg(x,', ') from jsonb_array_elements_text(v_compatibility->'blocking') x);
    end if;
    if jsonb_array_length(v_compatibility->'warnings') > 0 and not coalesce(p_allow_incompatible,false) then
      raise exception 'Successor % has compatibility warnings: %. Accept them to approve.', v_successor, (select string_agg(x,', ') from jsonb_array_elements_text(v_compatibility->'warnings') x);
    end if;
    insert into public.v2_model_successor_routing as s (model_slug, auto_route_enabled, approved_successor_slug, approved_by, approved_at, compatibility, notes)
    values (p_model_slug, true, v_successor, p_actor_user_id, now(),
      v_compatibility || jsonb_build_object('accepted_warnings', jsonb_array_length(v_compatibility->'warnings') > 0), nullif(btrim(p_notes),''))
    on conflict (model_slug) do update set auto_route_enabled=true, approved_successor_slug=excluded.approved_successor_slug,
      approved_by=excluded.approved_by, approved_at=excluded.approved_at, compatibility=excluded.compatibility,
      notes=coalesce(excluded.notes, s.notes), updated_at=now();
  else
    update public.v2_model_successor_routing set auto_route_enabled=false, approved_successor_slug=null, approved_by=null,
      approved_at=null, compatibility='{}'::jsonb, notes=coalesce(nullif(btrim(p_notes),''), notes), updated_at=now()
    where model_slug=p_model_slug;
  end if;

  v_current := public.get_model_successor_routing(p_model_slug);
  if v_current is distinct from v_before then
    insert into public.v2_catalogue_admin_changes (actor_user_id, resource_type, resource_id, action, before_state, after_state)
    values (p_actor_user_id, 'models', p_model_slug, 'update',
      jsonb_build_object('successor_routing', v_before), jsonb_build_object('successor_routing', v_current));
  end if;
  return v_current;
end $function$;

GRANT EXECUTE ON FUNCTION "public"."set_model_successor_routing"(uuid, text, boolean, boolean, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_model_successor_routing"(uuid, text, boolean, boolean, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_model_successor_routing"(uuid, text, boolean, boolean, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_model_successor_routing"(uuid, text, boolean, boolean, text) FROM PUBLIC, "anon", "authenticated";

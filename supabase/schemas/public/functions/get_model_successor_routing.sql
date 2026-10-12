CREATE OR REPLACE FUNCTION public.get_model_successor_routing (
  p_model_slug text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_model public.v2_models%rowtype; v_successor public.v2_models%rowtype; v_state public.v2_model_successor_routing%rowtype;
  v_missing_in text[]; v_missing_out text[]; v_context integer; v_successor_context integer; v_served boolean;
  v_blocking text[] := '{}'; v_warnings text[] := '{}'; v_compatibility jsonb;
begin
  select * into v_model from public.v2_models where model_slug=p_model_slug;
  if not found then raise exception 'model % does not exist', p_model_slug; end if;
  select * into v_state from public.v2_model_successor_routing where model_slug=p_model_slug;

  if v_model.replacement_model_slug is not null then
    select * into v_successor from public.v2_models where model_slug=v_model.replacement_model_slug;
  end if;
  if v_successor.model_slug is not null then
    select coalesce(array_agg(x),'{}') into v_missing_in from unnest(v_model.input_modalities) x where not x = any(v_successor.input_modalities);
    select coalesce(array_agg(x),'{}') into v_missing_out from unnest(v_model.output_modalities) x where not x = any(v_successor.output_modalities);
    select max(context_length) into v_context from public.v2_model_provider_routes where model_slug=v_model.model_slug;
    select max(context_length) into v_successor_context from public.v2_model_provider_routes where model_slug=v_successor.model_slug;
    v_served := public.v2_model_has_routable_route(v_successor.model_slug);

    -- Blocking issues can never be approved; warnings need an explicit override.
    if v_model.variant_kind='free' and v_successor.variant_kind<>'free' then v_blocking := v_blocking || 'free_to_paid'::text; end if;
    if v_successor.hidden then v_blocking := v_blocking || 'successor_hidden'::text; end if;
    if v_successor.status not in ('active','deprecated','retired') then v_blocking := v_blocking || 'successor_inactive'::text; end if;
    if cardinality(v_missing_in) > 0 then v_warnings := v_warnings || 'missing_input_modalities'::text; end if;
    if cardinality(v_missing_out) > 0 then v_warnings := v_warnings || 'missing_output_modalities'::text; end if;
    if v_context is not null and (v_successor_context is null or v_successor_context < v_context) then v_warnings := v_warnings || 'smaller_context'::text; end if;
    if not v_served then v_warnings := v_warnings || 'successor_not_served'::text; end if;

    v_compatibility := jsonb_build_object(
      'successor', v_successor.model_slug, 'successor_status', v_successor.status, 'successor_served', v_served,
      'missing_input_modalities', to_jsonb(v_missing_in), 'missing_output_modalities', to_jsonb(v_missing_out),
      'context_length', v_context, 'successor_context_length', v_successor_context,
      'blocking', to_jsonb(v_blocking), 'warnings', to_jsonb(v_warnings));
  end if;

  return jsonb_build_object(
    'model_slug', v_model.model_slug,
    'replacement_model_slug', v_model.replacement_model_slug,
    'unserved_since', v_state.unserved_since,
    'auto_route_enabled', coalesce(v_state.auto_route_enabled, false),
    'approved_successor_slug', v_state.approved_successor_slug,
    'approved_by', v_state.approved_by,
    'approved_at', v_state.approved_at,
    'approved_compatibility', coalesce(v_state.compatibility, '{}'::jsonb),
    'notes', v_state.notes,
    -- An approval only covers the successor that was reviewed.
    'approval_current', coalesce(v_state.auto_route_enabled, false) and v_state.approved_successor_slug is not distinct from v_model.replacement_model_slug,
    'compatibility', v_compatibility);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."get_model_successor_routing"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_model_successor_routing"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_model_successor_routing"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_model_successor_routing"(text) FROM PUBLIC, "anon", "authenticated";

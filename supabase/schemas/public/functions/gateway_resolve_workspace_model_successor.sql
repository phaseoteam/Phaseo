CREATE OR REPLACE FUNCTION public.gateway_resolve_workspace_model_successor (
  p_model_slug     text,
  p_successor_slug text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_model public.v2_models%rowtype; v_successor public.v2_models%rowtype; v_unserved_since timestamptz;
  v_target text; v_reason text; v_price jsonb;
begin
  -- A workspace's own replacement for a model no provider serves. It needs no
  -- admin approval and is one hop only, but keeps the grace period, a served
  -- target and the free-to-paid block. The workspace price policy does not
  -- apply: choosing the replacement is the workspace's decision.
  select * into v_model from public.v2_models where model_slug=p_model_slug and not hidden;
  if not found then return null; end if;
  select unserved_since into v_unserved_since from public.v2_model_successor_routing where model_slug=p_model_slug;
  select * into v_successor from public.v2_models where model_slug=p_successor_slug;

  if v_unserved_since is null or v_unserved_since > now() - interval '72 hours' then
    v_reason := 'within_grace_period';
  elsif v_successor.model_slug is null or v_successor.hidden or v_successor.status not in ('active','deprecated','retired')
    or not public.v2_model_has_routable_route(v_successor.model_slug) then
    v_reason := 'no_served_successor';
  elsif v_model.variant_kind='free' and v_successor.variant_kind<>'free' then
    v_reason := 'free_to_paid';
  else
    v_target := v_successor.model_slug;
    v_reason := 'eligible';
    v_price := public.v2_model_successor_price_ratio(p_model_slug, v_target);
  end if;

  return jsonb_build_object(
    'model', v_model.model_slug,
    'status', v_model.status,
    'retired_at', v_model.retired_at,
    'replacement_model', p_successor_slug,
    'unserved_since', v_unserved_since,
    'target', v_target,
    'chain', case when v_target is null then '[]'::jsonb else jsonb_build_array(v_target) end,
    'reason', v_reason,
    'price_ratio', (v_price->>'ratio')::numeric,
    'price_comparable', coalesce((v_price->>'comparable')::boolean, false),
    'price_skipped_meters', coalesce(v_price->'skipped_meters', '[]'::jsonb),
    'workspace_override', true);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_resolve_workspace_model_successor"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_resolve_workspace_model_successor"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_resolve_workspace_model_successor"(text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_resolve_workspace_model_successor"(text, text) FROM PUBLIC, "anon", "authenticated";

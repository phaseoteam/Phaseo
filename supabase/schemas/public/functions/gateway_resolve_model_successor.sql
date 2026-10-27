CREATE OR REPLACE FUNCTION public.gateway_resolve_model_successor (
  p_model_slug text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare v_model public.v2_models%rowtype; v_state public.v2_model_successor_routing%rowtype;
  v_current text; v_next text; v_next_replacement text; v_chain text[] := '{}'; v_target text; v_reason text;
  v_variant text; v_ratio numeric; v_comparable boolean := false; v_price jsonb;
begin
  -- Called by the gateway only when a request found no provider for the model.
  -- Lifecycle is public catalogue data; hidden models never match.
  select * into v_model from public.v2_models where model_slug=p_model_slug and not hidden;
  if not found then return null; end if;
  select * into v_state from public.v2_model_successor_routing where model_slug=p_model_slug;

  if v_state.unserved_since is null or v_state.unserved_since > now() - interval '72 hours' then
    v_reason := 'within_grace_period';
  else
    -- Follow approved successors to the first one a provider serves, at most 3 hops.
    -- Every hop needs a current approval: approved for today's replacement.
    v_current := p_model_slug;
    for i in 1..3 loop
      select m.replacement_model_slug into v_next from public.v2_models m where m.model_slug=v_current;
      if v_next is null or not exists (
        select 1 from public.v2_model_successor_routing s
        where s.model_slug=v_current and s.auto_route_enabled and s.approved_successor_slug=v_next
      ) then
        v_reason := case when i=1 then 'not_approved' else 'no_served_successor' end;
        exit;
      end if;
      if v_next = any(v_chain) or v_next=p_model_slug then v_reason := 'no_served_successor'; exit; end if;
      v_chain := v_chain || v_next;
      if exists (select 1 from public.v2_models m where m.model_slug=v_next and not m.hidden and m.status in ('active','deprecated','retired'))
        and public.v2_model_has_routable_route(v_next) then
        v_target := v_next; exit;
      end if;
      v_current := v_next;
    end loop;
    if v_target is null and v_reason is null then v_reason := 'no_served_successor'; end if;
  end if;

  if v_target is not null then
    select variant_kind into v_variant from public.v2_models where model_slug=v_target;
    if v_model.variant_kind='free' and v_variant<>'free' then
      v_reason := 'free_to_paid'; v_target := null;
    end if;
  end if;

  if v_target is not null then
    v_price := public.v2_model_successor_price_ratio(p_model_slug, v_target);
    v_comparable := (v_price->>'comparable')::boolean;
    v_ratio := (v_price->>'ratio')::numeric;
    v_reason := 'eligible';
  end if;

  return jsonb_build_object(
    'model', v_model.model_slug,
    'status', v_model.status,
    'retired_at', v_model.retired_at,
    'replacement_model', v_model.replacement_model_slug,
    'unserved_since', v_state.unserved_since,
    'target', v_target,
    'chain', to_jsonb(v_chain),
    'reason', v_reason,
    'price_ratio', v_ratio,
    'price_comparable', coalesce(v_comparable, false),
    'price_skipped_meters', coalesce(v_price->'skipped_meters', '[]'::jsonb));
end $function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_resolve_model_successor"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_resolve_model_successor"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_resolve_model_successor"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_resolve_model_successor"(text) FROM PUBLIC, "anon", "authenticated";

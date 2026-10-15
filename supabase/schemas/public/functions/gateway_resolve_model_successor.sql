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
  v_variant text; v_ratio numeric; v_comparable boolean := false;
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
    -- Compare standard-tier unit prices meter by meter. The old model uses its
    -- last known prices because its routes no longer serve; the successor only
    -- prices it can bill now. A meter the successor bills that the old model did
    -- not makes the prices not comparable.
    with prices as (
      select r.model_slug, mt.meter_key, min(mt.price_nanos / nullif(mt.unit_quantity, 0)) as unit_price
      from public.v2_model_provider_routes r
      join lateral (
        select distinct on (s.sku_code) s.sku_id from public.v2_pricing_skus s
        where s.provider_model_id=r.provider_model_id and s.status='active' and s.effective_from<=now()
          and (r.model_slug<>v_target or s.effective_to is null or now()<s.effective_to)
          and coalesce(s.service_tier_slug,'standard')='standard'
        order by s.sku_code, s.effective_from desc
      ) sku on true
      join public.v2_pricing_sku_meters mt on mt.sku_id=sku.sku_id and mt.billable
      where (r.model_slug=p_model_slug) or (r.model_slug=v_target and r.routing_enabled)
      group by r.model_slug, mt.meter_key
    ), pairs as (
      select o.unit_price as old_price, t.unit_price as new_price
      from prices t left join prices o on o.meter_key=t.meter_key and o.model_slug=p_model_slug
      where t.model_slug=v_target
    )
    select count(*) > 0 and bool_and(old_price is not null and (old_price > 0 or new_price = 0)),
      max(case when old_price > 0 then new_price / old_price when new_price = 0 then 0 end)
    into v_comparable, v_ratio from pairs;
    if not coalesce(v_comparable,false) then v_ratio := null; end if;
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
    'price_ratio', round(v_ratio, 6),
    'price_comparable', coalesce(v_comparable, false));
end $function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_resolve_model_successor"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_resolve_model_successor"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_resolve_model_successor"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_resolve_model_successor"(text) FROM PUBLIC, "anon", "authenticated";

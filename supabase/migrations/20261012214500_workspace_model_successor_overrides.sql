-- Successor routing: per-workspace replacements.
--
-- A workspace can name its own replacement for a model no provider serves,
-- or block the redirect for it (null successor). The price comparison moves
-- into v2_model_successor_price_ratio so both resolvers share it.

CREATE TABLE "public"."workspace_model_successor_overrides" (
  "workspace_id"         uuid                     NOT NULL,
  "model_slug"           text                     NOT NULL,
  "successor_model_slug" text,
  "created_by"           uuid,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_model_successor_overrides_not_self_check"
    CHECK (((successor_model_slug IS NULL) OR (successor_model_slug <> model_slug))),
  CONSTRAINT "workspace_model_successor_overrides_pkey" PRIMARY KEY (workspace_id, model_slug),
  CONSTRAINT "workspace_model_successor_overrides_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_model_successor_overrides_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE,
  CONSTRAINT "workspace_model_successor_overrides_successor_model_slug_fkey"
    FOREIGN KEY (successor_model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE,
  CONSTRAINT "workspace_model_successor_overrides_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_model_successor_overrides"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON "public"."workspace_model_successor_overrides"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE "public"."workspace_model_successor_overrides" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_model_successor_overrides" TO "service_role";

COMMENT ON TABLE "public"."workspace_model_successor_overrides" IS 'Per-workspace replacement for a model no provider serves any more. A null successor_model_slug means never redirect that model for the workspace.';

REVOKE ALL ON TABLE "public"."workspace_model_successor_overrides" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.v2_model_successor_price_ratio (
  p_from_model_slug text,
  p_to_model_slug   text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  -- Compares standard-tier unit prices on the meters both models bill and
  -- returns the largest ratio. The old model uses its last known prices because
  -- its routes no longer serve; the successor only counts routes that route.
  -- The ratio is null when the models share no meter the old model charged for.
  with prices as (
    select r.model_slug, mt.meter_key, min(mt.price_nanos / nullif(mt.unit_quantity, 0)) as unit_price
    from public.v2_model_provider_routes r
    join lateral (
      select distinct on (s.sku_code) s.sku_id from public.v2_pricing_skus s
      where s.provider_model_id=r.provider_model_id and s.status='active' and s.effective_from<=now()
        and coalesce(s.service_tier_slug,'standard')='standard'
      order by s.sku_code, s.effective_from desc
    ) sku on true
    join public.v2_pricing_sku_meters mt on mt.sku_id=sku.sku_id and mt.billable
    where r.model_slug=p_from_model_slug or (r.model_slug=p_to_model_slug and r.routing_enabled)
    group by r.model_slug, mt.meter_key
  ), pairs as (
    select o.unit_price as old_price, t.unit_price as new_price
    from prices o join prices t on t.meter_key=o.meter_key and t.model_slug=p_to_model_slug
    where o.model_slug=p_from_model_slug
  ), summary as (
    select count(*) > 0 and coalesce(bool_and(old_price > 0 or new_price = 0), false) as comparable,
      max(case when old_price > 0 then new_price / old_price when new_price = 0 then 0 end) as ratio
    from pairs
  )
  select jsonb_build_object('comparable', comparable, 'ratio', case when comparable then round(ratio, 6) end)
  from summary
$function$;

GRANT EXECUTE ON FUNCTION "public"."v2_model_successor_price_ratio"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."v2_model_successor_price_ratio"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."v2_model_successor_price_ratio"(text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."v2_model_successor_price_ratio"(text, text) FROM PUBLIC, "anon", "authenticated";

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
    'price_comparable', coalesce(v_comparable, false));
end $function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_resolve_model_successor"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_resolve_model_successor"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_resolve_model_successor"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_resolve_model_successor"(text) FROM PUBLIC, "anon", "authenticated";

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
    'workspace_override', true);
end $function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_resolve_workspace_model_successor"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_resolve_workspace_model_successor"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_resolve_workspace_model_successor"(text, text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_resolve_workspace_model_successor"(text, text) FROM PUBLIC, "anon", "authenticated";

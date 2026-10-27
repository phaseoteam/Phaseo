-- Compare successor prices the way a redirected request is billed.
--
-- Under the default "never pay more" policy almost no retired model could be
-- redirected, because v2_model_successor_price_ratio found the prices not
-- comparable for 137 of the 147 approved successors:
-- - The old model's last prices were ignored once their SKUs were deprecated.
-- - Most successors bill meters the old model never had, such as cached reads
--   or audio and image input, which a redirected request cannot use.
-- - 62 retired models have no price rows left at all.
--
-- The function now counts deprecated SKUs for the old model and falls back to
-- reference_prices (the model's last published list prices) when the old
-- model has no SKUs left. A meter only the successor bills is compared the way
-- a redirected request would be billed:
-- - cached reads are skipped (they cost less than the input already compared);
-- - cache writes and multimodal input tokens are compared with the old text
--   input price;
-- - web tool meters and meters in a modality the old model never had are
--   skipped only on condition: the resolvers return them as
--   price_skipped_meters, and the gateway treats the prices as not comparable
--   when the request could incur one of them.
-- Any other successor-only meter still makes the prices not comparable.

ALTER TABLE "public"."v2_model_successor_routing"
  ADD COLUMN "reference_prices" jsonb,
  ADD COLUMN "reference_price_source" text,
  ADD CONSTRAINT "v2_model_successor_routing_reference_prices_check" CHECK (((reference_prices IS NULL) OR (jsonb_typeof(reference_prices) = 'array'::text)));

COMMENT ON TABLE "public"."v2_model_successor_routing" IS 'Approval to route requests for a model to its replacement_model_slug once no provider serves it, plus the time it stopped being served. Approval is tied to approved_successor_slug and lapses if replacement_model_slug changes. approval_source is admin or auto (the hourly job approves replacements with no compatibility issues); auto_approval_blocked is set when an admin revokes, so the job leaves the model alone. reference_prices holds the model''s last published list prices ([{meter_key, unit_quantity, price_nanos}], source in reference_price_source) for retired models whose price rows are gone, so redirects can still compare prices.';

CREATE OR REPLACE FUNCTION public.v2_model_successor_price_ratio (
  p_from_model_slug text,
  p_to_model_slug   text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO 'public', 'pg_temp'
  AS $function$
  -- Compares standard-tier unit prices meter by meter and returns the largest
  -- ratio. The old model uses its last known prices because its routes no
  -- longer serve: active or deprecated SKUs whatever their end date, or, when
  -- none are left, the reference prices recorded for it. The successor only
  -- counts routes that route and SKUs it can bill now. input_tokens and
  -- output_tokens are the older names of the text token meters.
  -- A meter only the successor bills is compared the way a redirected request
  -- would be billed:
  -- - skipped for cached reads, which cost less than the input already compared;
  -- - skipped but listed in skipped_meters for web search and fetch tools the
  --   old model never billed and inputs or outputs in a modality it never had:
  --   the old model could not have served such a request, so the gateway only
  --   redirects one that uses none of them;
  -- - compared with the old text input price for cache writes (opt-in, and
  --   they replace input billing) and for image, audio or video input tokens
  --   the old model billed as ordinary input.
  -- Any other meter the old model did not bill, or billed at zero, leaves the
  -- ratio null.
  with sku_prices as (
    select r.model_slug, case mt.meter_key when 'input_tokens' then 'input_text_tokens'
      when 'output_tokens' then 'output_text_tokens' else mt.meter_key end as meter_key,
      min(mt.price_nanos / nullif(mt.unit_quantity, 0)) as unit_price
    from public.v2_model_provider_routes r
    join lateral (
      select distinct on (s.sku_code) s.sku_id from public.v2_pricing_skus s
      where s.provider_model_id=r.provider_model_id and s.effective_from<=now()
        and case when r.model_slug=p_to_model_slug
          then s.status='active' and (s.effective_to is null or now()<s.effective_to)
          else s.status in ('active','deprecated') end
        and coalesce(s.service_tier_slug,'standard')='standard'
      order by s.sku_code, s.effective_from desc
    ) sku on true
    join public.v2_pricing_sku_meters mt on mt.sku_id=sku.sku_id and mt.billable
    where r.model_slug=p_from_model_slug or (r.model_slug=p_to_model_slug and r.routing_enabled)
    group by 1, 2
  ), old_prices as (
    select meter_key, unit_price from sku_prices where model_slug=p_from_model_slug
    union all
    select case p->>'meter_key' when 'input_tokens' then 'input_text_tokens'
      when 'output_tokens' then 'output_text_tokens' else p->>'meter_key' end,
      min((p->>'price_nanos')::numeric / nullif((p->>'unit_quantity')::numeric, 0))
    from public.v2_model_successor_routing s, jsonb_array_elements(coalesce(s.reference_prices, '[]'::jsonb)) p
    where s.model_slug=p_from_model_slug
      and not exists (select 1 from sku_prices x where x.model_slug=p_from_model_slug)
    group by 1
  ), new_meters as (
    select t.meter_key, t.unit_price,
      substring(t.meter_key from '^(?:input|output)_(text|image|audio|video)_') as modality,
      t.meter_key like 'input_%' as is_input,
      exists (select 1 from old_prices o where o.meter_key=t.meter_key) as old_billed
    from sku_prices t where t.model_slug=p_to_model_slug
  ), classified as (
    select n.*,
      not n.old_billed and (n.meter_key like 'cached_read_%' or n.meter_key like 'implicit_cached_%') as cache_read,
      not n.old_billed and (n.meter_key in ('native_web_search_requests', 'native_web_fetch_requests')
        or (n.modality is not null and not n.modality = any(case when n.is_input then m.input_modalities else m.output_modalities end)))
        as needs_request_check
    from new_meters n
    cross join (select m.input_modalities, m.output_modalities from public.v2_models m where m.model_slug=p_from_model_slug) m
  ), pairs as (
    select o.unit_price as old_price, n.unit_price as new_price
    from classified n
    left join old_prices o on o.meter_key = case
      when n.old_billed then n.meter_key
      when n.meter_key like 'cached_write_%' or n.meter_key ~ '^input_(image|audio|video)_tokens$' then 'input_text_tokens'
      else n.meter_key end
    where not n.cache_read and not n.needs_request_check
  ), summary as (
    select count(*) > 0 and coalesce(bool_and(old_price is not null and (old_price > 0 or new_price = 0)), false) as comparable,
      max(case when old_price > 0 then new_price / old_price when new_price = 0 then 0 end) as ratio
    from pairs
  )
  -- skipped_meters only holds them while the prices are comparable: the
  -- gateway treats the prices as not comparable when the request could incur one.
  select jsonb_build_object('comparable', comparable, 'ratio', case when comparable then round(ratio, 6) end,
    'skipped_meters', case when comparable then coalesce(
      (select jsonb_agg(meter_key order by meter_key) from classified where needs_request_check), '[]'::jsonb) end)
  from summary
$function$;

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

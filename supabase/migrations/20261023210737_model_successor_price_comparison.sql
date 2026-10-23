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
-- The function now counts deprecated SKUs for the old model, falls back to
-- reference_prices (the model's last published list prices) when the old
-- model has no SKUs left, and compares a meter only the successor bills the
-- way a redirected request would be billed: skipped when the request cannot
-- incur it (cached reads, web tools, new modalities), compared with the old
-- text input price for cache writes and multimodal input tokens. Any other
-- successor-only meter still makes the prices not comparable.

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
  -- - skipped when the request cannot incur it: cached reads (cheaper than
  --   input), web search and fetch tools the old model never billed, and
  --   inputs or outputs in a modality the old model never had;
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
  ), pairs as (
    select o.unit_price as old_price, n.unit_price as new_price
    from new_meters n
    cross join (select m.input_modalities, m.output_modalities from public.v2_models m where m.model_slug=p_from_model_slug) m
    left join old_prices o on o.meter_key = case
      when n.old_billed then n.meter_key
      when n.meter_key like 'cached_write_%' or n.meter_key ~ '^input_(image|audio|video)_tokens$' then 'input_text_tokens'
      else n.meter_key end
    where n.old_billed or not (
      n.meter_key like 'cached_read_%' or n.meter_key like 'implicit_cached_%'
      or n.meter_key in ('native_web_search_requests', 'native_web_fetch_requests')
      or (n.modality is not null and not n.modality = any(case when n.is_input then m.input_modalities else m.output_modalities end)))
  ), summary as (
    select count(*) > 0 and coalesce(bool_and(old_price is not null and (old_price > 0 or new_price = 0)), false) as comparable,
      max(case when old_price > 0 then new_price / old_price when new_price = 0 then 0 end) as ratio
    from pairs
  )
  select jsonb_build_object('comparable', comparable, 'ratio', case when comparable then round(ratio, 6) end)
  from summary
$function$;

CREATE VIEW "private"."v2_rpc_pricing_compat" WITH (security_invoker=true) AS  SELECT (meter.sku_meter_id)::text AS rule_id,
    route.provider_slug AS provider_id,
    route.model_slug AS api_model_id,
    ((((route.provider_slug || ':'::text) || route.model_slug) || ':'::text) || sku.operation) AS model_key,
    sku.operation AS capability_id,
    COALESCE(sku.service_tier_slug, 'standard'::text) AS pricing_plan,
    meter.meter_key AS meter,
    meter.unit,
    meter.unit_quantity AS unit_size,
    (meter.price_nanos / 1000000000.0) AS price_per_unit,
    sku.currency,
    meter.meter_order AS priority,
    sku.effective_from,
    sku.effective_to,
    COALESCE((sku.metadata -> 'match'::text), (meter.metadata -> 'match'::text), '[]'::jsonb) AS match,
    COALESCE((sku.metadata ->> 'billing_timestamp_basis'::text), 'request_start'::text) AS billing_timestamp_basis,
    COALESCE((sku.metadata -> 'time_windows'::text), '[]'::jsonb) AS time_windows,
    COALESCE((meter.metadata ->> 'note'::text), sku.description) AS note,
    GREATEST(sku.created_at, meter.created_at) AS created_at,
    GREATEST(sku.updated_at, meter.updated_at) AS updated_at
   FROM ((public.v2_pricing_skus sku
     JOIN public.v2_model_provider_routes route ON ((route.provider_model_id = sku.provider_model_id)))
     JOIN public.v2_pricing_sku_meters meter ON ((meter.sku_id = sku.sku_id)))
  WHERE meter.billable;

GRANT SELECT ON TABLE "private"."v2_rpc_pricing_compat" TO "service_role";

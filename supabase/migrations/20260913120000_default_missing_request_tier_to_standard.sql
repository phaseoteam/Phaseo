-- The gateway now records Standard when neither the request nor the provider
-- specifies a tier. Backfill the window read by provider health so recent
-- tierless requests can appear without waiting for new traffic.
update public.v2_request_facts
set service_tier_slug = case when endpoint = 'batch' then 'batch' else 'standard' end
where service_tier_slug is null
  and provider_model_id is not null
  and occurred_at >= now() - interval '3 days';

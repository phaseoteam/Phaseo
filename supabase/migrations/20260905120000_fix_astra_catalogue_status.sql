-- GPT-6 Astra is available and must not retain its pre-launch
-- withheld/disabled state in databases populated before the launch import.

update public.v2_models
set
  status = 'active',
  catalogue_status = 'available',
  hidden = false,
  updated_at = now()
where model_slug = 'openai/gpt-6-astra'
  and (
    status <> 'active'
    or catalogue_status <> 'available'
    or hidden
  );

update public.v2_model_provider_routes
set
  status = 'active',
  provider_availability_status = 'available',
  phaseo_status = 'enabled',
  access_scope = 'public',
  routing_enabled = true,
  updated_at = now()
where model_slug = 'openai/gpt-6-astra'
  and provider_slug = 'openai'
  and (
    status <> 'active'
    or provider_availability_status <> 'available'
    or phaseo_status <> 'enabled'
    or access_scope <> 'public'
    or not routing_enabled
  );

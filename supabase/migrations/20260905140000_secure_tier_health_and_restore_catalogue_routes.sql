-- Only the web API may publish tier health after cohort suppression and
-- stealth-provider redaction. Revoke existing grants as well as PUBLIC access.
revoke execute on function public.get_v2_model_provider_tier_health_metrics(text, integer, numeric)
  from public, anon, authenticated;
grant execute on function public.get_v2_model_provider_tier_health_metrics(text, integer, numeric)
  to service_role;

-- These nine capabilities remain operational until provider retirement.
-- Keep lifecycle metadata on the route; do not enable other degraded rows.
update public.v2_route_capabilities capability
set status = 'active'
from public.v2_model_provider_routes route
where capability.provider_model_id = route.provider_model_id
  and capability.capability_id = 'text.generate'
  and capability.status = 'degraded'
  and route.provider_slug = 'weights-and-biases'
  and route.provider_model_id in (
    'weights-and-biases:deepseek/deepseek-v4-flash',
    'weights-and-biases:deepseek/deepseek-v4-pro',
    'weights-and-biases:ibm/granite-4.1-8b',
    'weights-and-biases:meta/llama-3.1-70b',
    'weights-and-biases:qwen/qwen3-30b-a3b-2507',
    'weights-and-biases:qwen/qwen3.5-35b-a3b',
    'weights-and-biases:qwen/qwen3.6-27b',
    'weights-and-biases:qwen/qwen3-14b',
    'weights-and-biases:jetbrains/mellum2-12b-a2.5b'
  )
  and route.provider_availability_status = 'deprecated'
  and route.routing_enabled
  and route.effective_to = '2026-09-28T00:00:00Z'::timestamptz
  and route.effective_to > now();

-- Match the corrected authored route immediately, before the next import.
update public.v2_model_provider_routes
set input_modalities = array['text']::text[]
where provider_model_id = 'crofai:deepseek-v4-flash-vision-exp'
  and provider_slug = 'crofai';

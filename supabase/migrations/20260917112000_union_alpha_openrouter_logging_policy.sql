-- Keep the public Union Alpha/OpenRouter mapping explicit about its logging
-- posture. The provider-level value is the fallback; the capability value is
-- what the model pricing and provider-info surfaces prefer when present.

update public.v2_providers
set data_policy_tier = 'logs',
    data_policy_confidence = 'maybe',
    data_policy_contract_mode = 'none',
    updated_at = now()
where provider_slug = 'openrouter';

update public.v2_route_capabilities as capability
set metadata = jsonb_set(
      coalesce(capability.metadata, '{}'::jsonb),
      '{data_policy}',
      jsonb_build_object(
        'tier', 'logs',
        'confidence', 'maybe',
        'contractMode', 'none',
        'zdrEligibility', 'unknown',
        'retentionMode', 'unknown',
        'retentionDays', null,
        'reason', 'OpenRouter logging and retention vary by upstream endpoint; this route is not guaranteed zero-data-retention.',
        'evidenceUrl', 'https://openrouter.ai/docs/guides/privacy/provider-logging/'
      ),
      true
    ),
    updated_at = now()
from public.v2_model_provider_routes as route
where capability.provider_model_id = route.provider_model_id
  and route.provider_model_id = 'stealth:stealth/union-alpha:openrouter'
  and route.model_slug = 'stealth/union-alpha'
  and route.provider_slug = 'openrouter'
  and capability.capability_id = 'text.generate';

-- Keep the public catalogue limited to canonical, independently described
-- models while retaining provider discoveries for later editorial review.

with alias_targets(alias_slug, model_slug) as (
  values
    ('mistral/codestral-latest', 'mistral/codestral-2508'),
    ('mistral/devstral-latest', 'mistral/devstral-2.0'),
    ('mistral/devstral-small-latest', 'mistral/devstral-small-2.0'),
    ('mistral/mistral-large-latest', 'mistral/mistral-large-2512'),
    ('mistral/mistral-medium-latest', 'mistral/mistral-medium-3.5'),
    ('openai/chat-latest', 'openai/gpt-6-luna'),
    ('openai/gpt-chat-latest', 'openai/gpt-6-luna'),
    ('openai/gpt-5-chat-latest', 'openai/gpt-5'),
    ('openai/gpt-5.1-chat-latest', 'openai/gpt-5.1'),
    ('openai/gpt-5.2-chat-latest', 'openai/gpt-5.2'),
    ('openai/chatgpt-image-latest', 'openai/gpt-image-2.5-flare'),
    ('tencent/hy-role-latest', 'tencent/hy-role')
)
update public.v2_model_provider_routes route
set model_slug = target.model_slug,
    metadata = coalesce(route.metadata, '{}'::jsonb) || jsonb_build_object(
      'canonical_model_slug', target.model_slug,
      'identity_override', true,
      'identity_override_reason', 'Rolling provider identifier is an alias, not a canonical model.',
      'identity_override_at', '2026-09-23T00:00:00Z'
    ),
    updated_at = now()
from alias_targets target
where route.model_slug = target.alias_slug;

insert into public.v2_model_aliases (
  alias_slug,
  model_slug,
  alias_type,
  enabled,
  metadata
)
values
  ('mistral/codestral-latest', 'mistral/codestral-2508', 'stable', true, '{"source":"catalogue_quality_cleanup","evidence_url":"https://docs.mistral.ai/studio/conversations/function-calling"}'::jsonb),
  ('mistral/devstral-latest', 'mistral/devstral-2.0', 'stable', true, '{"source":"catalogue_quality_cleanup","evidence_url":"https://docs.mistral.ai/studio/conversations/function-calling"}'::jsonb),
  ('mistral/devstral-small-latest', 'mistral/devstral-small-2.0', 'stable', true, '{"source":"catalogue_quality_cleanup","evidence_url":"https://docs.mistral.ai/studio/conversations/function-calling"}'::jsonb),
  ('mistral/mistral-large-latest', 'mistral/mistral-large-2512', 'stable', true, '{"source":"catalogue_quality_cleanup","evidence_url":"https://docs.mistral.ai/studio/conversations/function-calling"}'::jsonb),
  ('mistral/mistral-medium-latest', 'mistral/mistral-medium-3.5', 'stable', true, '{"source":"catalogue_quality_cleanup","evidence_url":"https://docs.mistral.ai/studio/conversations/function-calling"}'::jsonb),
  ('openai/chat-latest', 'openai/gpt-6-luna', 'stable', true, '{"source":"catalogue_quality_cleanup","reason":"Rolling ChatGPT alias consolidated into the current stable instant model."}'::jsonb),
  ('openai/gpt-chat-latest', 'openai/gpt-6-luna', 'stable', true, '{"source":"catalogue_quality_cleanup","reason":"Duplicate rolling alias consolidated."}'::jsonb),
  ('openai/gpt-5-chat-latest', 'openai/gpt-5', 'stable', true, '{"source":"catalogue_quality_cleanup"}'::jsonb),
  ('openai/gpt-5.1-chat-latest', 'openai/gpt-5.1', 'stable', true, '{"source":"catalogue_quality_cleanup"}'::jsonb),
  ('openai/gpt-5.2-chat-latest', 'openai/gpt-5.2', 'stable', true, '{"source":"catalogue_quality_cleanup"}'::jsonb),
  ('openai/chatgpt-image-latest', 'openai/gpt-image-2.5-flare', 'stable', true, '{"source":"catalogue_quality_cleanup"}'::jsonb),
  ('tencent/hy-role-latest', 'tencent/hy-role', 'stable', true, '{"source":"catalogue_quality_cleanup"}'::jsonb)
on conflict (alias_slug) do update
set model_slug = excluded.model_slug,
    alias_type = excluded.alias_type,
    enabled = excluded.enabled,
    effective_to = null,
    metadata = public.v2_model_aliases.metadata || excluded.metadata,
    updated_at = now();

update public.v2_models
set hidden = true,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'catalogue_identity', 'alias',
      'canonical_visibility_reason', 'Rolling identifiers resolve through v2_model_aliases and must not render as standalone model cards.',
      'catalogue_quality_reviewed_at', '2026-09-23T00:00:00Z'
    ),
    updated_at = now()
where model_slug in (
  'mistral/codestral-latest',
  'mistral/devstral-latest',
  'mistral/devstral-small-latest',
  'mistral/mistral-large-latest',
  'mistral/mistral-medium-latest',
  'openai/chat-latest',
  'openai/gpt-chat-latest',
  'openai/gpt-5-chat-latest',
  'openai/gpt-5.1-chat-latest',
  'openai/gpt-5.2-chat-latest',
  'openai/chatgpt-image-latest',
  'tencent/hy-role-latest'
);

-- Mistral still documents these canonical releases behind its rolling aliases.
update public.v2_models
set status = 'active',
    catalogue_status = 'available',
    hidden = false,
    deprecated_at = null,
    retired_at = null,
    updated_at = now()
where model_slug in ('mistral/devstral-2.0', 'mistral/devstral-small-2.0');

-- Provider-catalog artefacts without first-party canonical evidence are kept
-- internally for auditability but removed from public discovery and routing.
update public.v2_models
set status = 'retired',
    catalogue_status = 'retired',
    hidden = true,
    deprecated_at = coalesce(deprecated_at, '2026-09-23T00:00:00Z'::timestamptz),
    retired_at = coalesce(retired_at, '2026-09-23T00:00:00Z'::timestamptz),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'catalogue_quality_disposition', 'provider_catalogue_artifact',
      'catalogue_quality_reason', 'No independently verified canonical model identity.',
      'catalogue_quality_reviewed_at', '2026-09-23T00:00:00Z'
    ),
    updated_at = now()
where model_slug in (
  'openai/gpt-5.4-image-2',
  'spacex-ai/grok-4.2-fast',
  'spacex-ai/grok-4.2-fast-non-reasoning'
);

update public.v2_model_provider_routes
set status = 'retired',
    routing_enabled = false,
    provider_availability_status = 'removed',
    phaseo_status = 'disabled',
    effective_to = coalesce(effective_to, '2026-09-23T00:00:00Z'::timestamptz),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'catalogue_quality_disposition', 'provider_catalogue_artifact',
      'catalogue_quality_reviewed_at', '2026-09-23T00:00:00Z'
    ),
    updated_at = now()
where model_slug in (
  'openai/gpt-5.4-image-2',
  'spacex-ai/grok-4.2-fast',
  'spacex-ai/grok-4.2-fast-non-reasoning'
);

-- Preserve genuine historical Muse releases, but move them into the retired
-- lifecycle instead of mixing them with unsupported current models.
update public.v2_models
set status = 'retired',
    catalogue_status = 'retired',
    deprecated_at = coalesce(deprecated_at, '2026-07-09T00:00:00Z'::timestamptz),
    retired_at = coalesce(retired_at, '2026-08-05T00:00:00Z'::timestamptz),
    replacement_model_slug = coalesce(replacement_model_slug, 'meta/muse-spark-1.3'),
    updated_at = now()
where model_slug in ('meta/muse-spark', 'meta/muse-spark-contemplating');

-- Both Contributor offers have complete Meta routes, capabilities, and active
-- pricing. Their disabled route state was inconsistent with phaseo_status.
update public.v2_model_provider_routes
set status = 'active',
    routing_enabled = true,
    phaseo_status = 'enabled',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'catalogue_quality_repair', 'enabled_complete_contributor_route',
      'catalogue_quality_reviewed_at', '2026-09-23T00:00:00Z'
    ),
    updated_at = now()
where provider_model_id in (
  'meta:meta/muse-spark-1.2-contributor',
  'meta:meta/muse-spark-1.3-contributor'
)
and provider_availability_status = 'available'
and phaseo_status = 'enabled';

-- The GMI MiniMax M3 free promotion ended on 7 September. The canonical M3
-- model remains active; only the expired free offer becomes historical.
update public.v2_models
set status = 'retired',
    catalogue_status = 'retired',
    deprecated_at = coalesce(deprecated_at, '2026-09-07T00:00:00Z'::timestamptz),
    retired_at = coalesce(retired_at, '2026-09-07T00:00:00Z'::timestamptz),
    updated_at = now()
where model_slug = 'minimax/minimax-m3:free';

-- Replace the two provider-only descriptions that are currently callable.
update public.v2_models
set description = 'Ling 2.6 Flash is InclusionAI''s 104B-parameter sparse MoE instruction model with 7.4B active parameters, optimized for fast, token-efficient agent workflows, tool use, planning, and software-engineering tasks.',
    license = 'MIT',
    license_url = 'https://huggingface.co/inclusionAI/Ling-2.6-flash/blob/main/LICENSE',
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{sources}',
      coalesce(metadata->'sources', '[]'::jsonb) || '[{"url":"https://huggingface.co/inclusionAI/Ling-2.6-flash","kind":"official_model_card","accessed_at":"2026-09-23T00:00:00Z"}]'::jsonb,
      true
    ),
    updated_at = now()
where model_slug = 'inclusionai/ling-2.6-flash';

update public.v2_models
set description = 'Ring 2.6 1T is InclusionAI''s trillion-parameter instruction model for high-capability reasoning, coding, mathematics, tool use, and long-horizon agent workflows.',
    license = 'MIT',
    license_url = 'https://huggingface.co/inclusionAI/Ring-2.6-1T/blob/main/LICENSE',
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{sources}',
      coalesce(metadata->'sources', '[]'::jsonb) || '[{"url":"https://huggingface.co/inclusionAI/Ring-2.6-1T","kind":"official_model_card","accessed_at":"2026-09-23T00:00:00Z"}]'::jsonb,
      true
    ),
    updated_at = now()
where model_slug = 'inclusionai/ring-2.6-1t';

-- Quarantine imported records whose only description is provider placement.
-- They remain in the database for research and can be restored after an
-- independent first-party description is added. Callable models are excluded.
update public.v2_models model
set hidden = true,
    metadata = coalesce(model.metadata, '{}'::jsonb) || jsonb_build_object(
      'catalogue_quality_disposition', 'needs_first_party_description',
      'catalogue_quality_reason', 'Provider availability is not a model description.',
      'catalogue_quality_reviewed_at', '2026-09-23T00:00:00Z'
    ),
    updated_at = now()
where model.hidden = false
  and not exists (
    select 1
    from public.v2_model_provider_routes route
    where route.model_slug = model.model_slug
      and route.routing_enabled = true
  )
  and (
    model.description ~* '^.+ is available through ZenMux''s unified model API\.$'
    or model.description ~* '^.+ is available through NVIDIA''s hosted NIM API catalog\.$'
    or model.description ~* '^.+ is available through OrcaRouter under the exact model ID .+\.$'
    or model.description ~* '^.+ (is available|is offered) through Tencent Cloud TokenHub\.$'
    or model.description ~* '^.+ is available through Novita''s serverless model API\.$'
  );

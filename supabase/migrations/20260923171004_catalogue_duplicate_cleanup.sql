-- Consolidate canonical model identities that were split only by provider
-- spelling or redundant instruct suffixes. Provider model slugs remain intact.

with duplicate_targets(alias_slug, model_slug) as (
  values
    ('cohere/command-r7b', 'cohere/command-r-7b'),
    ('meta/llama-3.1-8b-instruct', 'meta/llama-3.1-8b'),
    ('meta/llama-3.2-90b-vision-instruct', 'meta/llama-3.2-90b-vision'),
    ('meta/llama-3.3-70b-instruct', 'meta/llama-3.3-70b'),
    ('meta/meta-llama-3.1-70b-instruct', 'meta/llama-3.1-70b-instruct'),
    ('qwen/qwen2.5-coder-32b-instruct', 'qwen/qwen2.5-coder-32b'),
    ('qwen/qwen3-coder-480b-a35b-instruct', 'qwen/qwen3-coder-480b-a35b')
)
update public.v2_model_provider_routes route
set model_slug = target.model_slug,
    metadata = coalesce(route.metadata, '{}'::jsonb) || jsonb_build_object(
      'canonical_model_slug', target.model_slug,
      'identity_override', true,
      'identity_override_reason', 'Duplicate canonical identity consolidated during catalogue quality review.',
      'identity_override_at', '2026-09-23T00:00:00Z'
    ),
    updated_at = now()
from duplicate_targets target
where route.model_slug = target.alias_slug;

insert into public.v2_model_aliases (alias_slug, model_slug, alias_type, enabled, metadata)
values
  ('cohere/command-r7b', 'cohere/command-r-7b', 'provider', true, '{"source":"catalogue_duplicate_cleanup"}'::jsonb),
  ('meta/llama-3.1-8b-instruct', 'meta/llama-3.1-8b', 'provider', true, '{"source":"catalogue_duplicate_cleanup"}'::jsonb),
  ('meta/llama-3.2-90b-vision-instruct', 'meta/llama-3.2-90b-vision', 'provider', true, '{"source":"catalogue_duplicate_cleanup"}'::jsonb),
  ('meta/llama-3.3-70b-instruct', 'meta/llama-3.3-70b', 'provider', true, '{"source":"catalogue_duplicate_cleanup"}'::jsonb),
  ('meta/meta-llama-3.1-70b-instruct', 'meta/llama-3.1-70b-instruct', 'provider', true, '{"source":"catalogue_duplicate_cleanup"}'::jsonb),
  ('qwen/qwen2.5-coder-32b-instruct', 'qwen/qwen2.5-coder-32b', 'provider', true, '{"source":"catalogue_duplicate_cleanup"}'::jsonb),
  ('qwen/qwen3-coder-480b-a35b-instruct', 'qwen/qwen3-coder-480b-a35b', 'provider', true, '{"source":"catalogue_duplicate_cleanup"}'::jsonb)
on conflict (alias_slug) do update
set model_slug = excluded.model_slug,
    alias_type = excluded.alias_type,
    enabled = true,
    effective_to = null,
    metadata = public.v2_model_aliases.metadata || excluded.metadata,
    updated_at = now();

update public.v2_models
set hidden = true,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'catalogue_identity', 'alias',
      'catalogue_quality_disposition', 'duplicate_identity',
      'catalogue_quality_reviewed_at', '2026-09-23T00:00:00Z'
    ),
    updated_at = now()
where model_slug in (
  'cohere/command-r7b',
  'meta/llama-3.1-8b-instruct',
  'meta/llama-3.2-90b-vision-instruct',
  'meta/llama-3.3-70b-instruct',
  'meta/meta-llama-3.1-70b-instruct',
  'qwen/qwen2.5-coder-32b-instruct',
  'qwen/qwen3-coder-480b-a35b-instruct'
);

update public.v2_models
set description = 'Qwen3 Coder 480B A35B Instruct is Alibaba''s 480B-total-parameter, 35B-active-parameter sparse MoE coding model for repository-scale understanding, tool use, and long-horizon software-engineering agents.',
    metadata = jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{sources}',
      coalesce(metadata->'sources', '[]'::jsonb) || '[{"url":"https://huggingface.co/Qwen/Qwen3-Coder-480B-A35B-Instruct","kind":"official_model_card","accessed_at":"2026-09-23T00:00:00Z"}]'::jsonb,
      true
    ),
    updated_at = now()
where model_slug = 'qwen/qwen3-coder-480b-a35b';

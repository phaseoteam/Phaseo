-- Consolidate duplicate model and lab records introduced by provider catalogue
-- imports. This migration is intentionally idempotent because the production
-- data repair was applied before the repository migration was prepared.
-- phaseo:allow-destructive-migration reason: remove three empty duplicate lab rows after explicit dependency checks

create temporary table catalogue_model_artifact_map (
  artifact text primary key,
  canonical text not null
) on commit drop;

insert into catalogue_model_artifact_map (artifact, canonical) values
  ('anthropic/claude-haiku-4-5', 'anthropic/claude-haiku-4.5'),
  ('anthropic/claude-sonnet-4-5', 'anthropic/claude-sonnet-4.5'),
  ('anthropic/claude-sonnet-4-6', 'anthropic/claude-sonnet-4.6'),
  ('bytedance/seedance-1-5-pro', 'bytedance/seedance-1.5-pro'),
  ('deepseek/deepseek_v3', 'deepseek/deepseek-v3'),
  ('mistral/mistral-medium-3-5', 'mistral/mistral-medium-3.5'),
  ('qwen/qwen-2.5-72b-instruct', 'qwen/qwen2.5-72b-instruct'),
  ('qwen/qwen-2.5-coder-32b-instruct', 'qwen/qwen2.5-coder-32b-instruct'),
  ('qwen/qwen3.5-plus-20260420', 'qwen/qwen3.5-plus-2026-04-20'),
  ('tencent/hy3-free', 'tencent/hy3:free'),
  ('upstage/solar-pro4', 'upstage/solar-pro-4'),
  ('z-ai/glm-4.7-flash-free', 'z-ai/glm-4.7-flash:free');

update public.v2_model_provider_routes as route
set model_slug = mapping.canonical,
    updated_at = now()
from catalogue_model_artifact_map as mapping
where route.model_slug = mapping.artifact;

insert into public.v2_model_aliases (
  alias_slug,
  model_slug,
  alias_type,
  enabled,
  effective_from,
  effective_to,
  metadata
)
select
  mapping.artifact,
  mapping.canonical,
  'legacy',
  true,
  now(),
  null,
  jsonb_build_object(
    'reason', 'Canonicalized duplicate created by a provider catalogue import',
    'source', 'catalogue_artifact_repair',
    'repaired_at', now()
  )
from catalogue_model_artifact_map as mapping
on conflict (alias_slug) do update
set model_slug = excluded.model_slug,
    alias_type = excluded.alias_type,
    enabled = true,
    effective_to = null,
    metadata = excluded.metadata,
    updated_at = now();

update public.v2_models as model
set status = 'retired',
    hidden = true,
    retired_at = coalesce(model.retired_at, now()),
    replacement_model_slug = mapping.canonical,
    catalogue_status = 'retired',
    metadata = coalesce(model.metadata, '{}'::jsonb) || jsonb_build_object(
      'consolidated_into', mapping.canonical,
      'catalogue_artifact_repaired_at', now()
    ),
    updated_at = now()
from catalogue_model_artifact_map as mapping
where model.model_slug = mapping.artifact;

create temporary table catalogue_model_name_fixes (
  model_slug text primary key,
  corrected_name text not null
) on commit drop;

insert into catalogue_model_name_fixes (model_slug, corrected_name) values
  ('ai21/jamba-1.5-large-instruct', 'Jamba 1.5 Large Instruct'),
  ('bytedance/seed-2.0-code', 'Seed 2.0 Code'),
  ('deepseek/deepseek-coder-6.7b-instruct', 'DeepSeek Coder 6.7B Instruct'),
  ('google/codegemma-1.1-7b', 'CodeGemma 1.1 7B'),
  ('meta/llama-3.1-8b-instruct', 'Llama 3.1 8B Instruct'),
  ('meta/llama-3.2-11b-vision-instruct', 'Llama 3.2 11B Vision Instruct'),
  ('meta/llama-3.2-90b-vision-instruct', 'Llama 3.2 90B Vision Instruct'),
  ('meta/llama-3.3-70b-instruct', 'Llama 3.3 70B Instruct'),
  ('meta/llama-3.3-70b-instruct-turbo', 'Llama 3.3 70B Instruct Turbo'),
  ('meta/meta-llama-3.1-405b-instruct', 'Meta Llama 3.1 405B Instruct'),
  ('meta/meta-llama-3.1-70b-instruct', 'Meta Llama 3.1 70B Instruct'),
  ('meta/meta-llama-3.1-8b-instruct-turbo', 'Meta Llama 3.1 8B Instruct Turbo'),
  ('mistral/codestral-22b-instruct-v0.1', 'Codestral 22B Instruct v0.1'),
  ('mistral/mistral-7b-instruct-v0.3', 'Mistral 7B Instruct v0.3'),
  ('mistral/mixtral-8x22b-v0.1', 'Mixtral 8x22B v0.1'),
  ('nvidia/ising-calibration-1.5-31b', 'Ising Calibration 1.5 31B'),
  ('nvidia/llama-3.1-nemoguard-8b-content-safety', 'Llama 3.1 NemoGuard 8B Content Safety'),
  ('nvidia/llama-3.1-nemoguard-8b-topic-control', 'Llama 3.1 NemoGuard 8B Topic Control'),
  ('nvidia/llama-3.1-nemotron-51b-instruct', 'Llama 3.1 Nemotron 51B Instruct'),
  ('nvidia/llama-3.1-nemotron-nano-vl-8b-v1', 'Llama 3.1 Nemotron Nano VL 8B v1'),
  ('nvidia/llama-3.1-nemotron-safety-guard-8b-v3', 'Llama 3.1 Nemotron Safety Guard 8B v3'),
  ('nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1', 'Llama 3.2 NeMo Retriever 1B VLM Embed v1'),
  ('nvidia/llama-3.2-nv-embedqa-1b-v1', 'Llama 3.2 NV-EmbedQA 1B v1'),
  ('nvidia/llama3-chatqa-1.5-70b', 'Llama 3 ChatQA 1.5 70B'),
  ('nvidia/nemotron-3.5-content-safety', 'Nemotron 3.5 Content Safety'),
  ('nvidia/nemotron-lightning-3.5-30b-a3b', 'Nemotron Lightning 3.5 30B A3B'),
  ('nvidia/riva-translate-4b-instruct-v1.1', 'Riva Translate 4B Instruct v1.1'),
  ('qwen/qwen2.5-72b-instruct', 'Qwen2.5 72B Instruct'),
  ('qwen/qwen2.5-coder-32b-instruct', 'Qwen2.5 Coder 32B Instruct'),
  ('spacex-ai/grok-4.2-beta', 'Grok 4.2 Beta'),
  ('z-ai/glm-5.2-fast', 'GLM 5.2 Fast');

update public.v2_models as model
set name = name_fix.corrected_name,
    metadata = coalesce(model.metadata, '{}'::jsonb) || jsonb_build_object(
      'display_name_repaired_at', now(),
      'display_name_repair_source', 'provider_catalogue_import_artifact_audit'
    ),
    updated_at = now()
from catalogue_model_name_fixes as name_fix
where model.model_slug = name_fix.model_slug
  and model.name is distinct from name_fix.corrected_name;

-- Regional provider offers inherit branding from their provider family. The EU
-- offer had the legacy metadata value but not the relational family field used
-- by the public provider/logo payload.
update public.v2_providers
set provider_family_slug = 'mistral',
    updated_at = now()
where provider_slug = 'mistral-eu'
  and provider_family_slug is distinct from 'mistral';

-- These imported lab aliases are empty and duplicate established canonical labs.
-- The dependency checks make the cleanup safe to re-run and prevent accidental
-- deletion if any of them acquires real catalogue data before deployment.
delete from public.v2_labs as lab
where lab.lab_slug in ('mistralai', 'ibm-granite', 'xai')
  and not exists (
    select 1 from public.v2_models as model where model.lab_slug = lab.lab_slug
  )
  and not exists (
    select 1 from public.v2_providers as provider where provider.lab_slug = lab.lab_slug
  )
  and not exists (
    select 1 from public.v2_model_families as family where family.lab_slug = lab.lab_slug
  )
  and not exists (
    select 1 from public.v2_lab_links as link where link.lab_slug = lab.lab_slug
  );

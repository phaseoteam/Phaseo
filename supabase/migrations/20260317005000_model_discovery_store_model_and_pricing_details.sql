-- Persist provider model payload details (including pricing hints) for model discovery.
-- This enables change tracking when provider /models endpoints expose pricing metadata.

alter table if exists public.model_discovery_seen_models
  add column if not exists model_details jsonb;
update public.model_discovery_seen_models
set model_details = '{}'::jsonb
where model_details is null;
alter table if exists public.model_discovery_seen_models
  alter column model_details set default '{}'::jsonb,
  alter column model_details set not null;
alter table if exists public.model_discovery_seen_models
  add column if not exists pricing_details jsonb;

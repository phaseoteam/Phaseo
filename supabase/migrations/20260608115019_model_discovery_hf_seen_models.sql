-- Persist watched Hugging Face model discovery state for scheduled worker runs.

create table if not exists public.model_discovery_hf_seen_models (
  org_id text not null,
  model_id text not null,
  first_seen_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  last_seen_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  constraint model_discovery_hf_seen_models_pkey primary key (org_id, model_id)
);

create index if not exists model_discovery_hf_seen_models_last_seen_at_idx
  on public.model_discovery_hf_seen_models (last_seen_at);

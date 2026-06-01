-- Persist Hugging Face and internal catalog discovery state for Cloudflare cron runs.

create table if not exists public.model_discovery_hf_seen_models (
  org_id text not null,
  model_id text not null,
  first_seen_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  last_seen_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  last_run_id uuid,
  constraint model_discovery_hf_seen_models_pkey primary key (org_id, model_id),
  constraint model_discovery_hf_seen_models_last_run_id_fkey foreign key (last_run_id) references public.model_discovery_runs(id) on delete set null
);

create index if not exists model_discovery_hf_seen_models_last_seen_at_idx
  on public.model_discovery_hf_seen_models (last_seen_at);

create table if not exists public.model_discovery_internal_seen_models (
  model_id text not null,
  name text not null,
  organisation_id text not null,
  organisation_name text,
  organisation_colour text,
  status text,
  announcement_date timestamp with time zone,
  release_date timestamp with time zone,
  deprecation_date timestamp with time zone,
  retirement_date timestamp with time zone,
  first_seen_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  last_seen_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  last_run_id uuid,
  constraint model_discovery_internal_seen_models_pkey primary key (model_id),
  constraint model_discovery_internal_seen_models_last_run_id_fkey foreign key (last_run_id) references public.model_discovery_runs(id) on delete set null
);

create index if not exists model_discovery_internal_seen_models_last_seen_at_idx
  on public.model_discovery_internal_seen_models (last_seen_at);

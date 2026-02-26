-- Persist model discovery state for Cloudflare cron/manual runs.
-- Designed for compact storage with retention-based cleanup.

create table if not exists public.model_discovery_runs (
  id uuid not null default gen_random_uuid(),
  trigger text not null,
  source text not null,
  scheduled_at timestamp with time zone,
  status text not null default 'running'::text,
  started_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  finished_at timestamp with time zone,
  providers_total integer not null default 0,
  providers_success integer not null default 0,
  providers_skipped integer not null default 0,
  providers_error integer not null default 0,
  changes_count integer not null default 0,
  stale_models_deleted integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error text,
  constraint model_discovery_runs_pkey primary key (id),
  constraint model_discovery_runs_trigger_check check (trigger in ('scheduled', 'manual')),
  constraint model_discovery_runs_status_check check (status in ('running', 'completed', 'completed_with_errors', 'failed')),
  constraint model_discovery_runs_providers_total_check check (providers_total >= 0),
  constraint model_discovery_runs_providers_success_check check (providers_success >= 0),
  constraint model_discovery_runs_providers_skipped_check check (providers_skipped >= 0),
  constraint model_discovery_runs_providers_error_check check (providers_error >= 0),
  constraint model_discovery_runs_changes_count_check check (changes_count >= 0),
  constraint model_discovery_runs_stale_models_deleted_check check (stale_models_deleted >= 0)
);

create index if not exists model_discovery_runs_started_at_idx
  on public.model_discovery_runs (started_at desc);

create table if not exists public.model_discovery_seen_models (
  provider_id text not null,
  model_id text not null,
  provider_name text not null,
  first_seen_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  last_seen_at timestamp with time zone not null default (now() at time zone 'utc'::text),
  last_run_id uuid,
  constraint model_discovery_seen_models_pkey primary key (provider_id, model_id),
  constraint model_discovery_seen_models_last_run_id_fkey foreign key (last_run_id) references public.model_discovery_runs(id) on delete set null
);

create index if not exists model_discovery_seen_models_last_seen_at_idx
  on public.model_discovery_seen_models (last_seen_at);

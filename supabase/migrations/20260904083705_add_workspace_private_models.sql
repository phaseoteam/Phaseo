-- phaseo:allow-production-history-backfill reason: reconciles the already-applied workspace private-model schema with repository migration history

create table if not exists public.workspace_private_models (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  model_id text not null,
  name text not null,
  description text,
  base_url text not null,
  upstream_model_id text not null,
  supports_responses boolean not null default false,
  enabled boolean not null default true,
  input_modalities text[] not null default array['text']::text[],
  output_modalities text[] not null default array['text']::text[],
  context_length integer,
  max_output_tokens integer,
  provider_id text not null,
  enc_value bytea not null,
  enc_iv bytea not null,
  enc_tag bytea not null,
  key_version integer not null,
  enc_aad_version integer not null default 1,
  fingerprint_sha256 text not null,
  credential_prefix text,
  credential_suffix text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_private_models_model_id_format
    check (model_id ~ '^[a-z0-9][a-z0-9._-]{0,62}/[a-z0-9][a-z0-9._:-]{0,126}$'),
  constraint workspace_private_models_name_length
    check (char_length(name) between 1 and 120),
  constraint workspace_private_models_https_base_url
    check (base_url ~ '^https://'),
  constraint workspace_private_models_upstream_model_length
    check (char_length(upstream_model_id) between 1 and 255),
  constraint workspace_private_models_context_length
    check (context_length is null or context_length > 0),
  constraint workspace_private_models_max_output_tokens
    check (max_output_tokens is null or max_output_tokens > 0),
  constraint workspace_private_models_provider_id
    check (provider_id = 'private-model:' || id::text),
  unique (workspace_id, model_id)
);
create index if not exists workspace_private_models_workspace_id_idx
  on public.workspace_private_models (workspace_id);
create index if not exists workspace_private_models_workspace_enabled_idx
  on public.workspace_private_models (workspace_id, enabled, model_id);
alter table public.workspace_private_models enable row level security;
revoke all on table public.workspace_private_models from public, anon, authenticated;
grant select, insert, update, delete on table public.workspace_private_models to service_role;
comment on table public.workspace_private_models is
  'Workspace-owned private model endpoints. Endpoint locations and credentials are server-only and never part of the public catalogue.';
comment on column public.workspace_private_models.provider_id is
  'Stable AES-GCM AAD identity. This value must never be exposed as a public provider.';
comment on column public.workspace_private_models.base_url is
  'Validated HTTPS OpenAI-compatible base URL. Server-side management APIs are the only supported write path.';

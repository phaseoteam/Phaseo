alter table public.workspace_private_models
  add column if not exists local_slug text,
  add column if not exists catalog_model_id text,
  add column if not exists host_provider_id text,
  add column if not exists custom_provider_name text,
  add column if not exists custom_provider_url text,
  add column if not exists routing_policy text not null default 'preferred';
update public.workspace_private_models
set local_slug = coalesce(local_slug, split_part(model_id, '/', 2)),
    custom_provider_name = coalesce(custom_provider_name, 'Private endpoint')
where local_slug is null or (host_provider_id is null and custom_provider_name is null);
alter table public.workspace_private_models
  alter column local_slug set not null,
  add constraint workspace_private_models_local_slug_format
    check (local_slug ~ '^[a-z0-9][a-z0-9._:-]{0,126}$'),
  add constraint workspace_private_models_catalog_model_id_format
    check (catalog_model_id is null or catalog_model_id ~ '^[a-z0-9][a-z0-9._-]{0,62}/[a-z0-9][a-z0-9._:-]{0,126}$'),
  add constraint workspace_private_models_host_identity
    check ((host_provider_id is not null) <> (custom_provider_name is not null)),
  add constraint workspace_private_models_custom_provider_name_length
    check (custom_provider_name is null or char_length(custom_provider_name) between 1 and 120),
  add constraint workspace_private_models_custom_provider_url_https
    check (custom_provider_url is null or custom_provider_url ~ '^https://'),
  add constraint workspace_private_models_routing_policy
    check (routing_policy in ('preferred', 'balanced', 'fallback'));
comment on column public.workspace_private_models.catalog_model_id is
  'Exact canonical public catalogue model identity. Null means this is a workspace-defined model.';
comment on column public.workspace_private_models.local_slug is
  'User-entered deployment slug. Workspace-defined models derive model_id from the workspace namespace and this value.';
comment on column public.workspace_private_models.host_provider_id is
  'Optional existing catalogue provider used for display and workspace telemetry; never used as encryption AAD.';
comment on column public.workspace_private_models.routing_policy is
  'How this private route participates alongside other routes for an attached catalogue model.';

-- Align the remaining historical v2 model identities with their owning lab.
-- Provider-specific route slugs remain unchanged; the old public model IDs
-- become aliases so existing links and API requests continue to resolve.

do $$
declare
  mapping record;
  source_model public.v2_models%rowtype;
begin
  for mapping in
    select *
    from (values
      ('ibm-granite/granite-4.0-h-micro', 'ibm/granite-4.0-h-micro', 'ibm'),
      ('nousresearch/hermes-3-llama-3.1-405b', 'nous/hermes-3-llama-3.1-405b', 'nous'),
      ('mistralai/mistral-nemo', 'mistral/mistral-nemo', 'mistral'),
      ('elevenlabs/music', 'eleven-labs/music', 'eleven-labs')
    ) as ids(old_slug, new_slug, lab_slug)
  loop
    select * into source_model
    from public.v2_models
    where model_slug = mapping.old_slug;

    if not found then
      continue;
    end if;

    -- Three targets are new canonical rows. The Nous target already exists,
    -- so its authored metadata remains authoritative while routes are merged.
    if not exists (
      select 1 from public.v2_models where model_slug = mapping.new_slug
    ) then
      insert into public.v2_models
      select (
        jsonb_populate_record(
          null::public.v2_models,
          to_jsonb(source_model) || jsonb_build_object(
            'model_slug', mapping.new_slug,
            'lab_slug', mapping.lab_slug,
            'updated_at', now()
          )
        )
      ).*;
    end if;

    update public.v2_model_provider_routes
    set model_slug = mapping.new_slug,
        updated_at = now()
    where model_slug = mapping.old_slug;

    update public.v2_model_aliases
    set model_slug = mapping.new_slug,
        updated_at = now()
    where model_slug = mapping.old_slug;

    update public.v2_request_facts
    set requested_model_slug = mapping.new_slug
    where requested_model_slug = mapping.old_slug;

    update public.v2_request_facts
    set routed_model_slug = mapping.new_slug
    where routed_model_slug = mapping.old_slug;

    update public.v2_private_usage_daily
    set model_slug = mapping.new_slug
    where model_slug = mapping.old_slug;

    update public.v2_public_usage_daily
    set model_slug = mapping.new_slug
    where model_slug = mapping.old_slug;

    update public.v2_public_usage_hourly
    set model_slug = mapping.new_slug
    where model_slug = mapping.old_slug;

    update public.v2_benchmark_results
    set model_slug = mapping.new_slug
    where model_slug = mapping.old_slug;

    update public.v2_subscription_plan_models
    set model_slug = mapping.new_slug
    where model_slug = mapping.old_slug;

    update public.v2_public_provider_health_daily
    set model_slug = mapping.new_slug
    where model_slug = mapping.old_slug;

    update public.v2_models
    set previous_model_slug = mapping.new_slug,
        updated_at = now()
    where previous_model_slug = mapping.old_slug;

    update public.v2_models
    set replacement_model_slug = mapping.new_slug,
        updated_at = now()
    where replacement_model_slug = mapping.old_slug;

    delete from public.v2_models where model_slug = mapping.old_slug;

    insert into public.v2_model_aliases (
      alias_slug,
      model_slug,
      alias_type,
      enabled,
      metadata
    ) values (
      mapping.old_slug,
      mapping.new_slug,
      'legacy',
      true,
      jsonb_build_object('reason', 'canonical_lab_prefix')
    )
    on conflict (alias_slug) do update set
      model_slug = excluded.model_slug,
      alias_type = excluded.alias_type,
      enabled = true,
      metadata = public.v2_model_aliases.metadata || excluded.metadata,
      updated_at = now();
  end loop;
end
$$;

alter table public.v2_models
  add constraint v2_models_lab_slug_prefix_check
  check (
    split_part(model_slug, '/', 1) = lab_slug
    and split_part(model_slug, '/', 2) <> ''
  ) not valid;

alter table public.v2_models
  validate constraint v2_models_lab_slug_prefix_check;

-- Keep provider identity approval separate from public route readiness.
-- An application may be approved while endpoint, credentials, adapter, model
-- review, or probe checks remain incomplete. Incomplete routes stay private.

alter table public.provider_catalog_events
  drop constraint if exists provider_catalog_events_type_check,
  add constraint provider_catalog_events_type_check check (event_type in (
    'catalog_applied', 'catalog_needs_changes', 'model_auto_approved',
    'model_approved', 'model_rejected', 'model_needs_changes', 'route_staged',
    'provider_application_reviewed'
  ));

alter table public.provider_onboarding_submissions
  add column if not exists application_type text not null default 'new',
  add column if not exists catalog_mode text not null default 'remote',
  add column if not exists provider_review_status text not null default 'awaiting_approval',
  add column if not exists provider_review_reason text,
  add column if not exists provider_reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists provider_reviewed_at timestamptz,
  add column if not exists pending_webhook_secret_ciphertext text,
  add column if not exists pending_webhook_secret_iv text,
  add column if not exists pending_webhook_secret_hash text;

alter table public.provider_onboarding_submissions
  drop constraint if exists provider_onboarding_submissions_application_type_check,
  add constraint provider_onboarding_submissions_application_type_check
    check (application_type in ('new', 'claim')),
  drop constraint if exists provider_onboarding_submissions_catalog_mode_check,
  add constraint provider_onboarding_submissions_catalog_mode_check
    check (catalog_mode in ('remote', 'managed')),
  drop constraint if exists provider_onboarding_submissions_provider_review_status_check,
  add constraint provider_onboarding_submissions_provider_review_status_check
    check (provider_review_status in ('awaiting_approval', 'approved', 'paused', 'rejected', 'needs_changes')),
  drop constraint if exists provider_onboarding_submissions_pending_webhook_secret_check,
  add constraint provider_onboarding_submissions_pending_webhook_secret_check
    check (
      (pending_webhook_secret_ciphertext is null and pending_webhook_secret_iv is null and pending_webhook_secret_hash is null)
      or (pending_webhook_secret_ciphertext is not null and pending_webhook_secret_iv is not null and pending_webhook_secret_hash is not null)
    );

update public.provider_onboarding_submissions submission
set application_type = 'claim'
where exists (
  select 1 from public.provider_account_links link
  where link.provider_slug = submission.provider_slug and link.proof_method = 'domain_file'
);

update public.provider_onboarding_submissions submission
set catalog_mode = coalesce(source.management_mode, case when submission.catalog_url is null then 'managed' else 'remote' end)
from public.provider_catalog_sources source
where source.provider_slug = submission.provider_slug;

update public.provider_onboarding_submissions submission
set provider_review_status = case
      when provider.metadata -> 'self_serve' ->> 'provider_review_status' in ('approved', 'paused', 'rejected', 'needs_changes')
        then provider.metadata -> 'self_serve' ->> 'provider_review_status'
      else 'awaiting_approval'
    end,
    provider_review_reason = nullif(provider.metadata -> 'self_serve' ->> 'provider_review_reason', '')
from public.v2_providers provider
where provider.provider_slug = submission.provider_slug
  and coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve';

-- Existing-provider claims must retain the existing public listing. Older
-- enrollment code could have attached the self_serve marker while claiming.
update public.v2_providers provider
set metadata = coalesce(provider.metadata, '{}'::jsonb) - 'self_serve',
    updated_at = now()
where coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve'
  and exists (
    select 1
    from public.provider_onboarding_submissions submission
    where submission.provider_slug = provider.provider_slug
      and submission.application_type = 'claim'
  );

create index if not exists provider_onboarding_submissions_review_queue_idx
  on public.provider_onboarding_submissions (provider_review_status, created_at desc);

create or replace function public.enforce_self_serve_provider_approval()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  is_self_serve boolean := false;
  review_status text;
begin
  select coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve',
    provider.metadata -> 'self_serve' ->> 'provider_review_status'
    into is_self_serve, review_status
  from public.v2_providers provider
  where provider.provider_slug = new.provider_slug;

  if is_self_serve and review_status is distinct from 'approved' then
    new.routing_enabled := false;
    new.access_scope := 'internal';
    new.phaseo_status := 'testing';
    if new.status in ('active', 'degraded') then new.status := 'disabled'; end if;
    if new.provider_availability_status in ('available', 'preview') then
      new.provider_availability_status := 'coming_soon';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_self_serve_provider_review_routing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  review_status text;
begin
  if coalesce(new.metadata, '{}'::jsonb) ? 'self_serve' then
    review_status := new.metadata -> 'self_serve' ->> 'provider_review_status';
    if review_status is distinct from 'approved' then
      new.routable := false;
      new.routing_enabled := false;
      if new.status in ('active', 'degraded', 'beta') then
        new.status := 'not_ready';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_self_serve_provider_review_routing on public.v2_providers;
create trigger enforce_self_serve_provider_review_routing
before insert or update on public.v2_providers
for each row execute function public.enforce_self_serve_provider_review_routing();

-- Clean up route/provider flags created by older pre-approval promotions.
update public.v2_providers provider
set status = case when provider.status in ('active', 'degraded', 'beta') then 'not_ready' else provider.status end,
    routable = false,
    routing_enabled = false,
    updated_at = now()
where coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve'
  and provider.metadata -> 'self_serve' ->> 'provider_review_status' is distinct from 'approved'
  and (provider.routable or provider.routing_enabled or provider.status in ('active', 'degraded', 'beta'));

update public.v2_model_provider_routes route
set status = 'disabled', routing_enabled = false, access_scope = 'internal',
    phaseo_status = 'testing', provider_availability_status = 'coming_soon', updated_at = now()
from public.v2_providers provider
where route.provider_slug = provider.provider_slug
  and route.metadata ->> 'managed_by' = 'provider_catalog'
  and coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve'
  and provider.metadata -> 'self_serve' ->> 'provider_review_status' is distinct from 'approved'
  and (route.status <> 'disabled' or route.routing_enabled or route.access_scope <> 'internal'
    or route.phaseo_status <> 'testing' or route.provider_availability_status <> 'coming_soon');

update public.v2_route_variants variant
set status = 'disabled', routing_enabled = false, updated_at = now()
from public.v2_model_provider_routes route
join public.v2_providers provider on provider.provider_slug = route.provider_slug
where variant.provider_model_id = route.provider_model_id
  and variant.metadata ->> 'managed_by' = 'provider_catalog'
  and coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve'
  and provider.metadata -> 'self_serve' ->> 'provider_review_status' is distinct from 'approved'
  and (variant.status <> 'disabled' or variant.routing_enabled);

update public.v2_route_capabilities capability
set status = 'internal_testing', updated_at = now()
from public.v2_model_provider_routes route
join public.v2_providers provider on provider.provider_slug = route.provider_slug
where capability.provider_model_id = route.provider_model_id
  and capability.metadata ->> 'managed_by' = 'provider_catalog'
  and coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve'
  and provider.metadata -> 'self_serve' ->> 'provider_review_status' is distinct from 'approved'
  and capability.status <> 'internal_testing';

update public.v2_models model
set hidden = true, updated_at = now()
where model.metadata ->> 'created_from_provider_proposal' = 'true'
  and exists (
    select 1 from public.v2_model_provider_routes route
    join public.v2_providers provider on provider.provider_slug = route.provider_slug
    where route.model_slug = model.model_slug
      and route.metadata ->> 'managed_by' = 'provider_catalog'
      and coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve'
      and provider.metadata -> 'self_serve' ->> 'provider_review_status' is distinct from 'approved'
  )
  and not exists (
    select 1 from public.v2_model_provider_routes route
    join public.v2_providers provider on provider.provider_slug = route.provider_slug
    where route.model_slug = model.model_slug
      and route.status in ('active', 'degraded')
      and route.routing_enabled
      and route.access_scope = 'public'
      and provider.routable and provider.routing_enabled
      and (not (coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve')
        or provider.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved')
  );

update public.v2_labs lab
set status = 'disabled', routable = false, updated_at = now()
where lab.metadata ->> 'created_from_provider_proposal' = 'true'
  and not exists (
    select 1 from public.v2_models model
    where model.lab_slug = lab.lab_slug and not model.hidden
  );

revoke all on function public.enforce_self_serve_provider_review_routing() from public, anon, authenticated;
grant execute on function public.enforce_self_serve_provider_review_routing() to service_role;
create or replace function public.promote_provider_catalog_candidate(
  p_run_id uuid,
  p_submitted_model_slug text
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  candidate public.provider_catalog_route_candidates%rowtype;
  provider_model_id_value text;
  capability jsonb;
  price jsonb;
  sku_id_value uuid;
  sku_version_value integer;
  variant_id_value uuid;
  route_status text;
  provider_availability text;
  phaseo_status_value text;
  access_scope_value text;
  route_enabled boolean;
  release_due boolean;
begin
  select * into candidate from public.provider_catalog_route_candidates
  where run_id = p_run_id and submitted_model_slug = p_submitted_model_slug for update;
  if not found then raise exception 'provider_catalog_candidate_not_found'; end if;
  if candidate.status <> 'probe_passed' then raise exception 'provider_catalog_probe_required'; end if;
  if exists (
    select 1 from public.provider_catalog_sync_runs newer
    join public.provider_catalog_sync_runs current_run on current_run.id = candidate.run_id
    where newer.provider_slug = candidate.provider_slug and newer.status = 'applied'
      and newer.created_at > current_run.created_at
  ) then raise exception 'provider_catalog_candidate_superseded'; end if;
  if jsonb_array_length(candidate.pricing) = 0 then raise exception 'provider_catalog_pricing_required'; end if;
  if not coalesce((select (metadata ->> 'adapter_ready')::boolean from public.v2_providers where provider_slug = candidate.provider_slug), false) then raise exception 'provider_catalog_adapter_required'; end if;
  if not coalesce((select (metadata ->> 'credentials_ready')::boolean from public.v2_providers where provider_slug = candidate.provider_slug), false) then raise exception 'provider_catalog_credentials_required'; end if;
  if not exists (select 1 from public.v2_providers where provider_slug = candidate.provider_slug and nullif(trim(base_url), '') is not null) then raise exception 'provider_catalog_endpoint_required'; end if;

  select provider_model_id into provider_model_id_value
  from public.v2_model_provider_routes
  where provider_slug = candidate.provider_slug
    and model_slug = candidate.canonical_model_slug
    and provider_model_slug = candidate.provider_model_slug
  order by created_at limit 1;
  if provider_model_id_value is null then
    provider_model_id_value := candidate.provider_slug || ':' || candidate.canonical_model_slug || ':' || candidate.provider_model_slug;
  end if;

  release_due := (candidate.available_from is null or candidate.available_from <= now())
    and (candidate.shutdown_at is null or candidate.shutdown_at > now());

  route_status := case
    when not release_due and candidate.availability in ('ready', 'degraded') then 'disabled'
    when candidate.availability = 'ready' then 'active'
    when candidate.availability = 'degraded' then 'degraded'
    when candidate.availability = 'retired' then 'disabled'
    else 'disabled'
  end;
  provider_availability := case
    when candidate.availability = 'ready' and release_due then 'available'
    when candidate.availability = 'degraded' and release_due then 'preview'
    when candidate.availability = 'deprecated' then 'deprecated'
    when candidate.availability = 'retired' then 'removed'
    else 'coming_soon'
  end;
  phaseo_status_value := case
    when candidate.availability in ('ready', 'degraded') and release_due then 'enabled'
    when candidate.availability = 'deprecated' then 'disabled'
    when candidate.availability = 'retired' then 'disabled'
    else 'testing'
  end;
  access_scope_value := case when candidate.availability in ('ready', 'degraded') and release_due then 'public' else 'internal' end;
  route_enabled := candidate.availability in ('ready', 'degraded') and release_due
    and exists (
      select 1 from public.v2_providers p
      where p.provider_slug = candidate.provider_slug
        and (
          (
            p.metadata ? 'self_serve'
            and p.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved'
            and (p.status = 'not_ready' or (p.status <> 'disabled' and p.routable and p.routing_enabled))
          )
          or (
            not (p.metadata ? 'self_serve')
            and (p.status = 'not_ready' or (p.status <> 'disabled' and p.routable and p.routing_enabled))
          )
        )
    )
    and not exists (select 1 from public.v2_model_provider_routes r
      where r.model_slug = candidate.canonical_model_slug and r.is_stealth);
  if not route_enabled then
    route_status := 'disabled';
    phaseo_status_value := 'testing';
    access_scope_value := 'internal';
  end if;

  insert into public.v2_model_provider_routes (
    provider_model_id, model_slug, provider_slug, provider_model_slug, status,
    routing_enabled, provider_availability_status, phaseo_status, access_scope,
    input_modalities, output_modalities, context_length, max_output_tokens,
    effective_from, effective_to, metadata, updated_at
  ) values (
    provider_model_id_value, candidate.canonical_model_slug, candidate.provider_slug,
    candidate.provider_model_slug, route_status, route_enabled,
    provider_availability, phaseo_status_value, access_scope_value,
    candidate.input_modalities, candidate.output_modalities, candidate.context_length,
    candidate.max_output_tokens, candidate.available_from, candidate.shutdown_at,
    jsonb_build_object(
      'managed_by', 'provider_catalog',
      'source_run_id', candidate.run_id,
      'deprecated_at', candidate.deprecated_at,
      'release_scheduled', not release_due and candidate.availability in ('ready', 'degraded'),
      'release_at', candidate.available_from
    ), now()
  )
  on conflict (provider_model_id) do update set
    provider_model_slug = excluded.provider_model_slug, status = excluded.status,
    routing_enabled = excluded.routing_enabled,
    provider_availability_status = excluded.provider_availability_status,
    phaseo_status = excluded.phaseo_status, access_scope = excluded.access_scope,
    input_modalities = excluded.input_modalities, output_modalities = excluded.output_modalities,
    context_length = excluded.context_length, max_output_tokens = excluded.max_output_tokens,
    effective_from = excluded.effective_from, effective_to = excluded.effective_to,
    metadata = public.v2_model_provider_routes.metadata || excluded.metadata, updated_at = now();

  update public.v2_route_capabilities set status = 'disabled', updated_at = now()
  where provider_model_id = provider_model_id_value;

  for capability in select value from jsonb_array_elements(candidate.capabilities)
  loop
    insert into public.v2_route_capabilities (
      provider_model_id, capability_id, status, max_output_tokens, params,
      effective_from, effective_to, metadata, updated_at
    ) values (
      provider_model_id_value, capability ->> 'id',
      case when route_enabled and candidate.availability = 'ready' then 'active'
           when route_enabled and candidate.availability = 'degraded' then 'degraded'
           when candidate.availability in ('deprecated', 'retired') then 'disabled'
           else 'internal_testing' end,
      candidate.max_output_tokens,
      coalesce((select jsonb_object_agg(p.value, true) from jsonb_array_elements_text(coalesce(capability -> 'parameters', '[]'::jsonb)) as p(value)), '{}'::jsonb),
      candidate.available_from, candidate.shutdown_at,
      jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id), now()
    )
    on conflict (provider_model_id, capability_id) do update set
      status = excluded.status, max_output_tokens = excluded.max_output_tokens,
      params = excluded.params, effective_from = excluded.effective_from,
      effective_to = excluded.effective_to,
      metadata = public.v2_route_capabilities.metadata || excluded.metadata, updated_at = now();
  end loop;

  insert into public.v2_route_variants (
    provider_model_id, variant_key, service_tier_slug, status,
    routing_enabled, endpoint_label, metadata, updated_at
  ) values (
    provider_model_id_value, 'global:standard', 'standard',
    case when route_enabled then route_status else 'disabled' end,
    route_enabled, 'Standard',
    jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id), now()
  )
  on conflict (provider_model_id, variant_key) do update set
    service_tier_slug = excluded.service_tier_slug,
    status = excluded.status,
    routing_enabled = excluded.routing_enabled,
    endpoint_label = excluded.endpoint_label,
    metadata = public.v2_route_variants.metadata || excluded.metadata,
    updated_at = now()
  returning variant_id into variant_id_value;

  update public.v2_pricing_skus
  set status = 'deprecated', effective_to = now(), updated_at = now()
  where provider_model_id = provider_model_id_value
    and sku_code = 'provider-catalog-standard' and status = 'active';
  select coalesce(max(version), 0) + 1 into sku_version_value
  from public.v2_pricing_skus
  where provider_model_id = provider_model_id_value and sku_code = 'provider-catalog-standard';
  insert into public.v2_pricing_skus (
    provider_model_id, route_variant_id, service_tier_slug, sku_code, version, operation, status, display_name,
    currency, effective_from, metadata
  ) values (
    provider_model_id_value, variant_id_value, 'standard', 'provider-catalog-standard', sku_version_value,
    'inference', 'active', 'Provider catalog pricing', 'USD', coalesce(candidate.available_from, now()),
    jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id, 'release_scheduled', not release_due)
  ) returning sku_id into sku_id_value;
  for price in select value from jsonb_array_elements(candidate.pricing)
  loop
    insert into public.v2_pricing_sku_meters (
      sku_id, meter_key, modality, direction, unit, unit_quantity,
      price_nanos, display_label, display_unit, metadata
    ) values (
      sku_id_value, price ->> 'meterKey', price ->> 'modality', nullif(price ->> 'direction', ''),
      price ->> 'unit', (price ->> 'unitQuantity')::numeric,
      (price ->> 'priceNanos')::numeric, price ->> 'displayLabel', price ->> 'displayUnit',
      jsonb_build_object('managed_by', 'provider_catalog', 'source_run_id', candidate.run_id)
    );
  end loop;

  update public.v2_providers
  set status = case
        when route_enabled
          and (status = 'not_ready' or (status = 'disabled' and metadata -> 'self_serve' ->> 'status' = 'submitted'))
          then 'beta'
        else status
      end,
      routable = case when route_enabled then true else routable end,
      routing_enabled = case when route_enabled then true else routing_enabled end,
      updated_at = now()
  where provider_slug = candidate.provider_slug;

  if route_enabled then
    update public.v2_models
    set hidden = false,
        released_at = coalesce(released_at, coalesce(candidate.available_from, now())),
        updated_at = now()
    where model_slug = candidate.canonical_model_slug
      and metadata ->> 'created_from_provider_proposal' = 'true'
      and not exists (select 1 from public.v2_model_provider_routes r where r.model_slug = candidate.canonical_model_slug and r.is_stealth);

    update public.v2_labs lab
    set status = case when lab.status = 'disabled' then 'active' else lab.status end,
        updated_at = now()
    where lab.lab_slug = (select model.lab_slug from public.v2_models model where model.model_slug = candidate.canonical_model_slug)
      and lab.metadata ->> 'created_from_provider_proposal' = 'true';
  end if;

  update public.provider_catalog_route_candidates
  set status = 'promoted', promoted_at = now(), updated_at = now()
  where run_id = p_run_id and submitted_model_slug = p_submitted_model_slug;

  update public.provider_catalog_sync_models
  set route_projection_status = case when route_enabled then 'enabled' else 'staged' end,
      route_projection_error = null
  where run_id = p_run_id and model_slug = p_submitted_model_slug;

  return provider_model_id_value;
end;
$$;
revoke all on function public.promote_provider_catalog_candidate(uuid, text) from public;
grant execute on function public.promote_provider_catalog_candidate(uuid, text) to service_role;

create or replace function public.activate_due_provider_catalog_releases()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  activated_count integer := 0;
  activated_route_ids text[] := '{}';
begin
  with due as (
    select route.provider_model_id,
      case when candidate.availability = 'ready' then 'active' else 'degraded' end as next_status
    from public.v2_model_provider_routes route
    join public.provider_catalog_route_candidates candidate
      on candidate.provider_slug = route.provider_slug
     and candidate.canonical_model_slug = route.model_slug
     and candidate.provider_model_slug = route.provider_model_slug
     and route.metadata ->> 'source_run_id' = candidate.run_id::text
    where candidate.status = 'promoted'
      and candidate.availability in ('ready', 'degraded')
      and route.metadata ->> 'managed_by' = 'provider_catalog'
      and route.metadata ->> 'release_scheduled' = 'true'
      and route.access_scope = 'internal'
      and route.effective_from is not null
      and route.effective_from <= now()
      and (route.effective_to is null or route.effective_to > now())
      and not route.is_stealth
      and not exists (
        select 1 from public.v2_model_provider_routes stealth_route
        where stealth_route.model_slug = route.model_slug and stealth_route.is_stealth
      )
      and exists (
        select 1 from public.v2_providers provider
        where provider.provider_slug = route.provider_slug
          and (provider.status = 'not_ready' or (provider.status <> 'disabled' and provider.routable and provider.routing_enabled))
          and (not (coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve')
            or provider.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved')
          and coalesce((provider.metadata ->> 'adapter_ready')::boolean, false)
          and coalesce((provider.metadata ->> 'credentials_ready')::boolean, false)
          and nullif(trim(provider.base_url), '') is not null
      )
    for update of route skip locked
  ), activated as (
    update public.v2_model_provider_routes route
    set status = due.next_status,
        routing_enabled = true,
        provider_availability_status = case when due.next_status = 'active' then 'available' else 'preview' end,
        phaseo_status = 'enabled', access_scope = 'public',
        metadata = route.metadata || jsonb_build_object('release_scheduled', false, 'release_activated_at', now()),
        updated_at = now()
    from due where route.provider_model_id = due.provider_model_id
    returning route.provider_model_id
  ) select coalesce(array_agg(provider_model_id), '{}'::text[]) into activated_route_ids from activated;
  activated_count := cardinality(activated_route_ids);

  update public.v2_route_variants variant
  set status = route.status, routing_enabled = true, updated_at = now()
  from public.v2_model_provider_routes route
  where route.provider_model_id = variant.provider_model_id
    and route.provider_model_id = any(activated_route_ids)
    and route.metadata ->> 'managed_by' = 'provider_catalog'
    and route.metadata ->> 'release_scheduled' = 'false'
    and route.metadata ->> 'release_activated_at' is not null
    and variant.metadata ->> 'managed_by' = 'provider_catalog'
    and variant.metadata ->> 'source_run_id' = route.metadata ->> 'source_run_id';

  update public.v2_route_capabilities capability
  set status = case when route.status = 'active' then 'active' else 'degraded' end, updated_at = now()
  from public.v2_model_provider_routes route
  where route.provider_model_id = capability.provider_model_id
    and route.provider_model_id = any(activated_route_ids)
    and route.metadata ->> 'managed_by' = 'provider_catalog'
    and route.metadata ->> 'release_scheduled' = 'false'
    and route.metadata ->> 'release_activated_at' is not null
    and capability.metadata ->> 'managed_by' = 'provider_catalog'
    and capability.metadata ->> 'source_run_id' = route.metadata ->> 'source_run_id';

  update public.v2_providers provider
  set status = case
        when provider.status = 'not_ready'
          or (provider.status = 'disabled' and provider.metadata -> 'self_serve' ->> 'status' = 'submitted')
          then 'beta'
        else provider.status
      end,
      routable = true, routing_enabled = true, updated_at = now()
  where (not (coalesce(provider.metadata, '{}'::jsonb) ? 'self_serve')
      or provider.metadata -> 'self_serve' ->> 'provider_review_status' = 'approved')
    and provider.provider_slug in (
      select distinct route.provider_slug
      from public.v2_model_provider_routes route
      where route.metadata ->> 'managed_by' = 'provider_catalog'
        and route.provider_model_id = any(activated_route_ids)
        and route.metadata ->> 'release_scheduled' = 'false'
        and route.metadata ->> 'release_activated_at' is not null
    );

  update public.v2_models model
  set hidden = false, released_at = coalesce(model.released_at, route.effective_from, now()), updated_at = now()
  from public.v2_model_provider_routes route
  where route.model_slug = model.model_slug
    and route.provider_model_id = any(activated_route_ids)
    and model.metadata ->> 'created_from_provider_proposal' = 'true'
    and route.metadata ->> 'managed_by' = 'provider_catalog'
    and route.metadata ->> 'release_scheduled' = 'false'
    and route.metadata ->> 'release_activated_at' is not null;

  update public.v2_labs lab
  set status = case when lab.status = 'disabled' then 'active' else lab.status end, updated_at = now()
  where lab.lab_slug in (
    select distinct model.lab_slug
    from public.v2_models model
    join public.v2_model_provider_routes route on route.model_slug = model.model_slug
    where model.metadata ->> 'created_from_provider_proposal' = 'true'
      and route.provider_model_id = any(activated_route_ids)
      and route.metadata ->> 'managed_by' = 'provider_catalog'
      and route.metadata ->> 'release_scheduled' = 'false'
      and route.metadata ->> 'release_activated_at' is not null
  );

  return activated_count;
end;
$$;

revoke all on function public.activate_due_provider_catalog_releases() from public;
grant execute on function public.activate_due_provider_catalog_releases() to service_role;

create or replace function public.set_self_serve_provider_review(
  p_provider_slug text,
  p_decision text,
  p_reason text,
  p_reviewed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewed_at_value timestamptz := now();
  activated_ids text[] := '{}';
  submitted_by_value uuid;
  review_message_value text;
begin
  if p_decision not in ('approved', 'paused', 'rejected', 'needs_changes') then
    raise exception 'invalid_provider_review_decision';
  end if;
  if p_decision <> 'approved' and nullif(btrim(p_reason), '') is null then
    raise exception 'provider_review_reason_required';
  end if;

  update public.v2_providers provider
  set metadata = jsonb_set(
        coalesce(provider.metadata, '{}'::jsonb),
        '{self_serve}',
        coalesce(provider.metadata -> 'self_serve', '{}'::jsonb) || jsonb_build_object(
          'provider_review_status', p_decision,
          'provider_review_reason', case when p_decision = 'approved' then null else p_reason end,
          'provider_reviewed_by', p_reviewed_by,
          'provider_reviewed_at', reviewed_at_value
        ),
        true
      ),
      status = 'not_ready',
      routable = false,
      routing_enabled = false,
      updated_at = reviewed_at_value
  where provider.provider_slug = p_provider_slug
    and provider.metadata ? 'self_serve';
  if not found then raise exception 'self_serve_provider_not_found'; end if;

  if p_decision = 'approved' then
    with eligible as (
      select route.provider_model_id,
        case when candidate.availability = 'ready' then 'active' else 'degraded' end as next_status
      from public.v2_model_provider_routes route
      join public.provider_catalog_route_candidates candidate
        on candidate.provider_slug = route.provider_slug
       and candidate.canonical_model_slug = route.model_slug
       and candidate.provider_model_slug = route.provider_model_slug
       and route.metadata ->> 'source_run_id' = candidate.run_id::text
      where route.provider_slug = p_provider_slug
        and candidate.status = 'promoted'
        and candidate.availability in ('ready', 'degraded')
        and (route.effective_from is null or route.effective_from <= reviewed_at_value)
        and (route.effective_to is null or route.effective_to > reviewed_at_value)
        and not route.is_stealth
        and coalesce((select (p.metadata ->> 'adapter_ready')::boolean from public.v2_providers p where p.provider_slug = route.provider_slug), false)
        and coalesce((select (p.metadata ->> 'credentials_ready')::boolean from public.v2_providers p where p.provider_slug = route.provider_slug), false)
        and exists (select 1 from public.v2_providers p where p.provider_slug = route.provider_slug and nullif(trim(p.base_url), '') is not null)
    ), activated as (
      update public.v2_model_provider_routes route
      set status = eligible.next_status,
          routing_enabled = true,
          provider_availability_status = case when eligible.next_status = 'active' then 'available' else 'preview' end,
          phaseo_status = 'enabled', access_scope = 'public',
          metadata = route.metadata || jsonb_build_object('release_scheduled', false, 'provider_approved_at', reviewed_at_value),
          updated_at = reviewed_at_value
      from eligible where route.provider_model_id = eligible.provider_model_id
      returning route.provider_model_id
    ) select coalesce(array_agg(provider_model_id), '{}'::text[]) into activated_ids from activated;

    if cardinality(activated_ids) > 0 then
      update public.v2_providers set status = 'beta', routable = true,
        routing_enabled = true, updated_at = reviewed_at_value
      where provider_slug = p_provider_slug;
    end if;

    update public.v2_route_variants variant set routing_enabled = true,
      status = case when route.status = 'degraded' then 'degraded'
        when variant.status = 'disabled' then 'active' else variant.status end,
      updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where variant.provider_model_id = any(activated_ids)
      and variant.provider_model_id = route.provider_model_id
      and variant.metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_route_capabilities capability set
      status = case when route.status = 'degraded' and capability.status = 'internal_testing' then 'degraded'
        when capability.status = 'internal_testing' then 'active' else capability.status end,
      updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where capability.provider_model_id = any(activated_ids)
      and capability.provider_model_id = route.provider_model_id
      and capability.metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_models model set hidden = false,
      released_at = coalesce(model.released_at, route.effective_from, reviewed_at_value), updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where route.provider_model_id = any(activated_ids) and model.model_slug = route.model_slug
      and model.metadata ->> 'created_from_provider_proposal' = 'true';
    update public.v2_labs lab set status = case when lab.status = 'disabled' then 'active' else lab.status end,
      updated_at = reviewed_at_value
    where lab.lab_slug in (
      select distinct model.lab_slug from public.v2_models model
      join public.v2_model_provider_routes route on route.model_slug = model.model_slug
      where route.provider_model_id = any(activated_ids)
        and model.metadata ->> 'created_from_provider_proposal' = 'true'
    );
  else
    update public.v2_model_provider_routes set status = 'disabled', routing_enabled = false,
      access_scope = 'internal', phaseo_status = 'testing', provider_availability_status = 'coming_soon', updated_at = reviewed_at_value
    where provider_slug = p_provider_slug and metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_route_variants variant set status = 'disabled', routing_enabled = false, updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where route.provider_slug = p_provider_slug and variant.provider_model_id = route.provider_model_id
      and variant.metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_route_capabilities capability set status = 'internal_testing', updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where route.provider_slug = p_provider_slug and capability.provider_model_id = route.provider_model_id
      and capability.metadata ->> 'managed_by' = 'provider_catalog';
  end if;

  select submitted_by into submitted_by_value
  from public.provider_onboarding_submissions
  where provider_slug = p_provider_slug and submitted_by is not null
  order by created_at desc limit 1;

  review_message_value := case p_decision
    when 'approved' then 'Your provider application is approved. You can manage your catalog in Phaseo; public routes still require separate model review and route readiness checks.'
    when 'needs_changes' then 'Phaseo requested changes to your provider application: ' || btrim(p_reason)
    when 'rejected' then 'Phaseo rejected your provider application: ' || btrim(p_reason)
    else 'Phaseo paused your provider application: ' || btrim(p_reason)
  end;

  insert into public.provider_catalog_events (
    provider_slug, account_user_id, workspace_id, event_type, title, message, payload
  )
  select p_provider_slug, submitted_by_value, link.workspace_id, 'provider_application_reviewed',
    'Provider application ' || replace(p_decision, '_', ' '), review_message_value,
    jsonb_build_object('decision', p_decision, 'reason', case when p_decision = 'approved' then null else p_reason end)
  from public.provider_account_links link
  where link.provider_slug = p_provider_slug and link.status in ('pending', 'active');

  return jsonb_build_object('providerSlug', p_provider_slug, 'decision', p_decision, 'activatedRouteIds', activated_ids);
end;
$$;
revoke all on function public.set_self_serve_provider_review(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.set_self_serve_provider_review(text, text, text, uuid) to service_role;

-- Stage existing-provider claims until the verified claim is approved. In
-- particular, do not replace a live provider profile or catalog source while
-- ownership is still under review.
create or replace function public.complete_provider_enrollment(
  p_user_id uuid,
  p_provider_slug text,
  p_provider_name text,
  p_provider_metadata jsonb,
  p_website_url text,
  p_logo_url text,
  p_catalog_url text,
  p_catalog_mode text,
  p_catalog_sha256 text,
  p_catalog_preview jsonb,
  p_validation_summary jsonb,
  p_model_count integer,
  p_proof_method text,
  p_proof_subject text,
  p_claim_challenge_id uuid default null,
  p_webhook_secret_ciphertext text default null,
  p_webhook_secret_iv text default null,
  p_webhook_secret_hash text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_submission public.provider_onboarding_submissions%rowtype;
  v_previous_submission public.provider_onboarding_submissions%rowtype;
  v_workspace_id uuid;
  v_link public.provider_account_links%rowtype;
  v_provider public.v2_providers%rowtype;
  v_provider_exists boolean := false;
  v_source_exists boolean := false;
  v_application_type text := 'new';
  v_workspace_slug text;
begin
  if p_catalog_mode not in ('remote', 'managed') then raise exception 'invalid_catalog_mode'; end if;
  if p_proof_method not in ('catalog_domain_match', 'domain_file', 'self_declared') then raise exception 'invalid_provider_proof_method'; end if;
  if p_catalog_mode = 'remote' and nullif(btrim(p_catalog_url), '') is null then raise exception 'remote_catalog_url_required'; end if;
  if p_model_count < 0 then raise exception 'invalid_model_count'; end if;

  perform 1 from public.users where user_id = p_user_id for update;
  if not found then raise exception 'provider_account_user_missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider_slug, 0));

  select * into v_provider
  from public.v2_providers
  where provider_slug = p_provider_slug
  for update;
  v_provider_exists := found;
  select * into v_previous_submission
  from public.provider_onboarding_submissions
  where provider_slug = p_provider_slug
  order by created_at desc
  limit 1
  for update;
  if p_claim_challenge_id is not null
    or (v_provider_exists and not (coalesce(v_provider.metadata, '{}'::jsonb) ? 'self_serve'))
    or (v_previous_submission.id is not null
      and v_previous_submission.application_type = 'claim'
      and v_previous_submission.provider_review_status <> 'approved') then
    v_application_type := 'claim';
  end if;
  if v_application_type = 'claim' and not v_provider_exists then
    raise exception 'provider_claim_target_missing';
  end if;

  if p_claim_challenge_id is not null then
    update public.provider_claim_challenges
       set status = 'verified', verified_at = now()
     where id = p_claim_challenge_id
       and provider_slug = p_provider_slug
       and requested_by = p_user_id
       and status = 'pending'
       and expires_at > now();
    if not found then raise exception 'provider_claim_challenge_unavailable'; end if;
  end if;

  select link.* into v_link from public.provider_account_links link
   where link.provider_slug = p_provider_slug
     and link.status in ('pending', 'active')
     and (
       exists (
         select 1 from public.workspaces workspace
         where workspace.id = link.workspace_id and workspace.owner_user_id = p_user_id
       )
       or exists (
         select 1 from public.workspace_members membership
         where membership.workspace_id = link.workspace_id
           and membership.user_id = p_user_id
           and membership.role in ('owner', 'admin')
       )
     )
   order by case when link.status = 'active' then 0 else 1 end limit 1 for update of link;
  if found then
    v_workspace_id := v_link.workspace_id;
  elsif v_application_type = 'claim' then
    if p_proof_method <> 'domain_file' then raise exception 'provider_claim_proof_required'; end if;
    if exists (
      select 1 from public.provider_account_links pending_link
      where pending_link.provider_slug = p_provider_slug
        and pending_link.status = 'pending'
        and pending_link.role = 'owner'
        and pending_link.proof_method = 'domain_file'
        and pending_link.linked_by is distinct from p_user_id
    ) then
      raise exception 'provider_claim_already_pending';
    end if;
    v_workspace_slug := 'provider-' || substr(md5(p_user_id::text || ':' || p_provider_slug), 1, 32);
    select id into v_workspace_id from public.workspaces
    where owner_user_id = p_user_id and slug = v_workspace_slug;
    if v_workspace_id is null then
      insert into public.workspaces (name, slug, owner_user_id, workspace_kind)
      values (left(p_provider_name || ' workspace', 120), v_workspace_slug, p_user_id, 'provider')
      returning id into v_workspace_id;
    end if;
    insert into public.workspace_members (workspace_id, user_id, role)
    values (v_workspace_id, p_user_id, 'owner')
    on conflict on constraint workspace_members_pkey do update set role = 'owner';
    insert into public.workspace_settings (workspace_id) values (v_workspace_id)
    on conflict on constraint workspace_settings_pkey do nothing;
    insert into public.provider_account_links as existing_link (
      provider_slug, workspace_id, linked_by, role, status, proof_method, proof_subject, verified_at
    ) values (
      p_provider_slug, v_workspace_id, p_user_id, 'owner', 'pending', 'domain_file', p_proof_subject, now()
    ) on conflict (provider_slug, workspace_id) do update
      set linked_by = excluded.linked_by,
          role = 'owner',
          status = case when existing_link.status = 'active' then 'active' else 'pending' end,
          proof_method = excluded.proof_method,
          proof_subject = excluded.proof_subject,
          verified_at = excluded.verified_at,
          updated_at = now();
  end if;

  if v_application_type <> 'claim' then
    insert into public.v2_providers (provider_slug, name, status, routing_enabled, routable, metadata)
    values (p_provider_slug, p_provider_name, 'not_ready', false, false, p_provider_metadata)
    on conflict (provider_slug) do update
      set name = excluded.name, metadata = excluded.metadata, updated_at = now();
  end if;

  perform 1 from public.provider_catalog_sources where provider_slug = p_provider_slug for update;
  v_source_exists := found;
  if v_application_type = 'claim' then
    if not v_source_exists and (
      p_webhook_secret_ciphertext is null or p_webhook_secret_iv is null or p_webhook_secret_hash is null
    ) then
      raise exception 'provider_webhook_secret_required';
    end if;
  elsif not v_source_exists then
    if p_webhook_secret_ciphertext is null or p_webhook_secret_iv is null or p_webhook_secret_hash is null then
      raise exception 'provider_webhook_secret_required';
    end if;
    insert into public.provider_catalog_sources (
      provider_slug, catalog_url, management_mode, managed_catalog,
      managed_updated_by, managed_updated_at, status, delivery_mode, created_by,
      webhook_secret_ciphertext, webhook_secret_iv, webhook_secret_hash, next_poll_at
    ) values (
      p_provider_slug, p_catalog_url, p_catalog_mode,
      case when p_catalog_mode = 'managed' then '{"data":[]}'::jsonb else null end,
      case when p_catalog_mode = 'managed' then p_user_id else null end,
      case when p_catalog_mode = 'managed' then now() else null end,
      'active', 'webhook_and_polling', p_user_id,
      p_webhook_secret_ciphertext, p_webhook_secret_iv, p_webhook_secret_hash,
      case when p_catalog_mode = 'managed' then null else now() end
    );
  elsif v_application_type <> 'claim' and p_catalog_mode = 'remote' then
    update public.provider_catalog_sources
       set catalog_url = p_catalog_url, management_mode = 'remote', managed_catalog = null,
           managed_updated_by = null, managed_updated_at = null, etag = null,
           last_modified = null, next_poll_at = now(), updated_at = now()
     where provider_slug = p_provider_slug;
  elsif v_application_type <> 'claim' then
    update public.provider_catalog_sources
       set catalog_url = null, management_mode = 'managed', managed_catalog = '{"data":[]}'::jsonb,
           managed_updated_by = p_user_id, managed_updated_at = now(), etag = null,
           last_modified = null, next_poll_at = null, refresh_requested = true, updated_at = now()
     where provider_slug = p_provider_slug;
  end if;

  insert into public.provider_onboarding_submissions (
    provider_slug, submitted_by, provider_name, website_url, logo_url, catalog_url,
    status, model_count, catalog_sha256, catalog_preview, validation_summary,
    application_type, catalog_mode, provider_review_status,
    pending_webhook_secret_ciphertext, pending_webhook_secret_iv, pending_webhook_secret_hash
  ) values (
    p_provider_slug, p_user_id, p_provider_name, p_website_url, p_logo_url, p_catalog_url,
    'submitted', p_model_count, p_catalog_sha256, p_catalog_preview, p_validation_summary,
    v_application_type, p_catalog_mode, 'awaiting_approval',
    case when v_application_type = 'claim' and not v_source_exists then p_webhook_secret_ciphertext end,
    case when v_application_type = 'claim' and not v_source_exists then p_webhook_secret_iv end,
    case when v_application_type = 'claim' and not v_source_exists then p_webhook_secret_hash end
  ) returning * into v_submission;

  if v_link.provider_slug is not null then
    if v_link.status = 'pending' and v_application_type <> 'claim' then
      update public.provider_account_links
         set status = 'active', proof_method = p_proof_method, proof_subject = p_proof_subject,
             verified_at = case when p_proof_method = 'self_declared' then null else now() end,
             updated_at = now()
       where provider_slug = p_provider_slug and workspace_id = v_link.workspace_id;
    end if;
  elsif v_application_type <> 'claim' then
    v_workspace_id := public.link_provider_personal_account(p_user_id, p_provider_slug, p_proof_subject, p_proof_method);
  end if;

  return jsonb_build_object(
    'provider', (select to_jsonb(p) from public.v2_providers p where p.provider_slug = p_provider_slug),
    'submission', to_jsonb(v_submission)
      - 'pending_webhook_secret_ciphertext'
      - 'pending_webhook_secret_iv'
      - 'pending_webhook_secret_hash',
    'providerWorkspaceId', v_workspace_id,
    'sourceCreated', not v_source_exists and v_application_type <> 'claim',
    'applicationType', v_application_type
  );
end;
$$;

revoke all on function public.complete_provider_enrollment(uuid,text,text,jsonb,text,text,text,text,text,jsonb,jsonb,integer,text,text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_provider_enrollment(uuid,text,text,jsonb,text,text,text,text,text,jsonb,jsonb,integer,text,text,uuid,text,text,text) to service_role;

-- Keep legacy provider claims in the admin application queue without changing
-- their live profile, routing state, or source until approval is recorded.
create or replace function public.review_provider_application(
  p_provider_slug text,
  p_decision text,
  p_reason text,
  p_reviewed_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_submission public.provider_onboarding_submissions%rowtype;
  source_row public.provider_catalog_sources%rowtype;
  reviewed_at_value timestamptz := now();
  review_message_value text;
  source_created_value boolean := false;
  claim_workspace_id uuid;
  claim_previously_approved boolean := false;
begin
  if p_decision not in ('approved', 'paused', 'rejected', 'needs_changes') then
    raise exception 'invalid_provider_review_decision';
  end if;
  if p_decision <> 'approved' and nullif(btrim(p_reason), '') is null then
    raise exception 'provider_review_reason_required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_provider_slug, 0));
  select * into latest_submission
  from public.provider_onboarding_submissions
  where provider_slug = p_provider_slug
  order by created_at desc
  limit 1
  for update;
  if not found then
    return public.set_self_serve_provider_review(p_provider_slug, p_decision, p_reason, p_reviewed_by);
  end if;
  select exists (
    select 1
    from public.provider_account_links link
    where link.provider_slug = p_provider_slug
      and link.linked_by = latest_submission.submitted_by
      and link.role = 'owner'
      and link.proof_method = 'domain_file'
      and link.status = 'active'
  ) into claim_previously_approved;

  perform 1 from public.v2_providers where provider_slug = p_provider_slug for update;
  if not found then raise exception 'self_serve_provider_not_found'; end if;

  if latest_submission.application_type <> 'claim' then
    update public.provider_onboarding_submissions
    set provider_review_status = p_decision,
        provider_review_reason = case when p_decision = 'approved' then null else btrim(p_reason) end,
        provider_reviewed_by = p_reviewed_by,
        provider_reviewed_at = reviewed_at_value,
        pending_webhook_secret_ciphertext = null,
        pending_webhook_secret_iv = null,
        pending_webhook_secret_hash = null,
      updated_at = reviewed_at_value
    where id = latest_submission.id;
    return public.set_self_serve_provider_review(p_provider_slug, p_decision, p_reason, p_reviewed_by)
      || jsonb_build_object('applicationType', latest_submission.application_type);
  end if;

  update public.provider_onboarding_submissions
  set provider_review_status = p_decision,
      provider_review_reason = case when p_decision = 'approved' then null else btrim(p_reason) end,
      provider_reviewed_by = p_reviewed_by,
      provider_reviewed_at = reviewed_at_value,
      updated_at = reviewed_at_value
  where id = latest_submission.id;

  if p_decision = 'approved' then
    select workspace_id into claim_workspace_id
    from public.provider_account_links
    where provider_slug = p_provider_slug
      and linked_by = latest_submission.submitted_by
      and role = 'owner'
      and status = 'pending'
      and proof_method = 'domain_file'
    order by verified_at desc nulls last, created_at desc
    limit 1
    for update;
    if found then
      update public.provider_account_links
      set status = 'revoked', updated_at = reviewed_at_value
      where provider_slug = p_provider_slug
        and role = 'owner'
        and status = 'active'
        and workspace_id <> claim_workspace_id;
      update public.provider_account_links
      set status = 'active',
          verified_at = coalesce(verified_at, reviewed_at_value),
          updated_at = reviewed_at_value
      where provider_slug = p_provider_slug
        and workspace_id = claim_workspace_id
        and linked_by = latest_submission.submitted_by
        and status = 'pending';
    end if;

    update public.v2_providers provider
    set name = latest_submission.provider_name,
        metadata = (coalesce(provider.metadata, '{}'::jsonb) - 'self_serve')
          || jsonb_build_object(
            'website_url', latest_submission.website_url,
            'logo_url', latest_submission.logo_url,
            'catalog_url', latest_submission.catalog_url,
            'catalog_sha256', latest_submission.catalog_sha256,
            'last_submitted_by', latest_submission.submitted_by,
            'last_submitted_at', latest_submission.submitted_at
          ),
        updated_at = reviewed_at_value
    where provider.provider_slug = p_provider_slug;

    select * into source_row
    from public.provider_catalog_sources
    where provider_slug = p_provider_slug
    for update;
    if found then
      update public.provider_catalog_sources source
      set catalog_url = case when latest_submission.catalog_mode = 'remote' then latest_submission.catalog_url else null end,
          management_mode = latest_submission.catalog_mode,
          managed_catalog = case
            when latest_submission.catalog_mode = 'remote' then null
            when source.management_mode = 'managed' and source.managed_catalog is not null then source.managed_catalog
            else '{"data":[]}'::jsonb
          end,
          managed_updated_by = case when latest_submission.catalog_mode = 'managed' then latest_submission.submitted_by else null end,
          managed_updated_at = case
            when latest_submission.catalog_mode = 'managed' then coalesce(source.managed_updated_at, reviewed_at_value)
            else null
          end,
          status = 'active',
          etag = null,
          last_modified = null,
          last_error = null,
          consecutive_failures = 0,
          refresh_requested = true,
          next_poll_at = case when latest_submission.catalog_mode = 'remote' then reviewed_at_value else null end,
          updated_at = reviewed_at_value
      where source.provider_slug = p_provider_slug;
    else
      insert into public.provider_catalog_sources (
        provider_slug, catalog_url, management_mode, managed_catalog,
        managed_updated_by, managed_updated_at, status, delivery_mode, created_by,
        webhook_secret_ciphertext, webhook_secret_iv, webhook_secret_hash, next_poll_at,
        refresh_requested, updated_at
      ) values (
        p_provider_slug,
        case when latest_submission.catalog_mode = 'remote' then latest_submission.catalog_url else null end,
        latest_submission.catalog_mode,
        case when latest_submission.catalog_mode = 'managed' then '{"data":[]}'::jsonb else null end,
        case when latest_submission.catalog_mode = 'managed' then latest_submission.submitted_by else null end,
        case when latest_submission.catalog_mode = 'managed' then reviewed_at_value else null end,
        'active', 'webhook_and_polling', latest_submission.submitted_by,
        latest_submission.pending_webhook_secret_ciphertext,
        latest_submission.pending_webhook_secret_iv,
        latest_submission.pending_webhook_secret_hash,
        case when latest_submission.catalog_mode = 'remote' then reviewed_at_value else null end,
        true, reviewed_at_value
      );
      source_created_value := true;
    end if;
  elsif p_decision = 'paused' and claim_previously_approved then
    -- A pause after ownership approval is an explicit provider-level action.
    -- Keep the catalog rows intact so they can be reviewed or re-enabled later.
    update public.v2_providers
    set status = 'not_ready', routable = false, routing_enabled = false,
        updated_at = reviewed_at_value
    where provider_slug = p_provider_slug;
  end if;

  update public.provider_onboarding_submissions
  set pending_webhook_secret_ciphertext = null,
      pending_webhook_secret_iv = null,
      pending_webhook_secret_hash = null
  where id = latest_submission.id;

  select case p_decision
    when 'approved' then 'Your provider claim is approved. You can now manage the catalog in Phaseo; public route and model checks still apply.'
    when 'needs_changes' then 'Phaseo requested changes to your provider claim: ' || btrim(p_reason)
    when 'rejected' then 'Phaseo rejected your provider claim: ' || btrim(p_reason)
    else 'Phaseo paused your provider claim: ' || btrim(p_reason)
  end into review_message_value;

  insert into public.provider_catalog_events (
    provider_slug, account_user_id, workspace_id, event_type, title, message, payload
  )
  select p_provider_slug, latest_submission.submitted_by, link.workspace_id, 'provider_application_reviewed',
    'Provider claim ' || replace(p_decision, '_', ' '), review_message_value,
    jsonb_build_object('decision', p_decision, 'reason', case when p_decision = 'approved' then null else p_reason end)
  from public.provider_account_links link
  where link.provider_slug = p_provider_slug
    and link.linked_by = latest_submission.submitted_by
    and link.role = 'owner'
    and link.status in ('pending', 'active');

  if p_decision = 'rejected' and not claim_previously_approved then
    update public.provider_account_links
    set status = 'revoked', updated_at = reviewed_at_value
    where provider_slug = p_provider_slug
      and linked_by = latest_submission.submitted_by
      and role = 'owner'
      and proof_method = 'domain_file'
      and status = 'pending';
  end if;

  return jsonb_build_object(
    'providerSlug', p_provider_slug,
    'decision', p_decision,
    'applicationType', 'claim',
    'sourceCreated', source_created_value,
    'providerWorkspaceId', claim_workspace_id
  );
end;
$$;
revoke all on function public.review_provider_application(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.review_provider_application(text, text, text, uuid) to service_role;

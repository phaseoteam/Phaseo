-- Self-serve providers may stage and test routes before Phaseo approves the
-- provider, but no route may become public or routable before that decision.

alter table public.provider_onboarding_submissions
  add column if not exists contact_email text;
alter table public.provider_onboarding_submissions
  drop constraint if exists provider_onboarding_submissions_contact_email_check;
alter table public.provider_onboarding_submissions
  add constraint provider_onboarding_submissions_contact_email_check
  check (contact_email is null or (length(contact_email) <= 320 and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'))
  not valid;

-- Keep the provider contact and one-time webhook secret in the same enrollment
-- transaction. The overload delegates to the existing atomic enrollment RPC,
-- then enriches the newly-created submission before the transaction commits.
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
  p_contact_email text,
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
  v_result jsonb;
begin
  v_result := public.complete_provider_enrollment(
    p_user_id => p_user_id,
    p_provider_slug => p_provider_slug,
    p_provider_name => p_provider_name,
    p_provider_metadata => p_provider_metadata,
    p_website_url => p_website_url,
    p_logo_url => p_logo_url,
    p_catalog_url => p_catalog_url,
    p_catalog_mode => p_catalog_mode,
    p_catalog_sha256 => p_catalog_sha256,
    p_catalog_preview => p_catalog_preview,
    p_validation_summary => p_validation_summary,
    p_model_count => p_model_count,
    p_proof_method => p_proof_method,
    p_proof_subject => p_proof_subject,
    p_claim_challenge_id => p_claim_challenge_id,
    p_webhook_secret_ciphertext => p_webhook_secret_ciphertext,
    p_webhook_secret_iv => p_webhook_secret_iv,
    p_webhook_secret_hash => p_webhook_secret_hash
  );

  update public.provider_onboarding_submissions
     set contact_email = p_contact_email
   where id = ((v_result -> 'submission' ->> 'id')::uuid);
  if not found then raise exception 'provider_enrollment_submission_missing'; end if;

  v_result := jsonb_set(v_result, '{submission,contact_email}', to_jsonb(p_contact_email), true);
  return v_result;
end;
$$;

revoke all on function public.complete_provider_enrollment(uuid,text,text,jsonb,text,text,text,text,text,jsonb,jsonb,integer,text,text,text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.complete_provider_enrollment(uuid,text,text,jsonb,text,text,text,text,text,jsonb,jsonb,integer,text,text,text,uuid,text,text,text) to service_role;

create or replace function public.enforce_self_serve_provider_approval()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  review_status text;
begin
  select provider.metadata -> 'self_serve' ->> 'provider_review_status'
    into review_status
  from public.v2_providers provider
  where provider.provider_slug = new.provider_slug;

  if review_status is not null and review_status <> 'approved' then
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

drop trigger if exists enforce_self_serve_provider_approval on public.v2_model_provider_routes;
create trigger enforce_self_serve_provider_approval
before insert or update on public.v2_model_provider_routes
for each row execute function public.enforce_self_serve_provider_approval();

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
      status = case when p_decision = 'approved' then 'beta' else 'not_ready' end,
      routable = p_decision = 'approved',
      routing_enabled = p_decision = 'approved',
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

    update public.v2_route_variants set routing_enabled = true,
      status = case when status = 'disabled' then 'active' else status end, updated_at = reviewed_at_value
    where provider_model_id = any(activated_ids) and metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_route_capabilities set
      status = case when status = 'internal_testing' then 'active' else status end, updated_at = reviewed_at_value
    where provider_model_id = any(activated_ids) and metadata ->> 'managed_by' = 'provider_catalog';
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

  return jsonb_build_object('providerSlug', p_provider_slug, 'decision', p_decision, 'activatedRouteIds', activated_ids);
end;
$$;

revoke all on function public.set_self_serve_provider_review(text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.set_self_serve_provider_review(text,text,text,uuid) to service_role;

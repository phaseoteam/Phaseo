-- phaseo:allow-production-history-backfill reason: Restore this already-applied production migration from supabase_migrations.schema_migrations so deployment history matches main.
-- Commit provider profile, catalog source, submission, ownership link and
-- ownership-proof consumption as one transaction. Validation and remote
-- catalog fetching happen before this service-role-only boundary.
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
  v_workspace_id uuid;
  v_link public.provider_account_links%rowtype;
  v_source_exists boolean;
begin
  if p_catalog_mode not in ('remote', 'managed') then raise exception 'invalid_catalog_mode'; end if;
  if p_proof_method not in ('catalog_domain_match', 'domain_file', 'self_declared') then raise exception 'invalid_provider_proof_method'; end if;
  if p_catalog_mode = 'remote' and nullif(btrim(p_catalog_url), '') is null then raise exception 'remote_catalog_url_required'; end if;
  if p_model_count < 0 then raise exception 'invalid_model_count'; end if;

  perform 1 from public.users where user_id = p_user_id for update;
  if not found then raise exception 'provider_account_user_missing'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider_slug, 0));

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

  insert into public.v2_providers (provider_slug, name, status, routing_enabled, routable, metadata)
  values (p_provider_slug, p_provider_name, 'not_ready', false, false, p_provider_metadata)
  on conflict (provider_slug) do update
    set name = excluded.name, metadata = excluded.metadata, updated_at = now();

  perform 1 from public.provider_catalog_sources where provider_slug = p_provider_slug for update;
  v_source_exists := found;
  if not v_source_exists then
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
  elsif p_catalog_mode = 'remote' then
    update public.provider_catalog_sources
       set catalog_url = p_catalog_url, management_mode = 'remote', managed_catalog = null,
           managed_updated_by = null, managed_updated_at = null, etag = null,
           last_modified = null, next_poll_at = now(), updated_at = now()
     where provider_slug = p_provider_slug;
  end if;

  insert into public.provider_onboarding_submissions (
    provider_slug, submitted_by, provider_name, website_url, logo_url, catalog_url,
    status, model_count, catalog_sha256, catalog_preview, validation_summary
  ) values (
    p_provider_slug, p_user_id, p_provider_name, p_website_url, p_logo_url, p_catalog_url,
    'submitted', p_model_count, p_catalog_sha256, p_catalog_preview, p_validation_summary
  ) returning * into v_submission;

  select * into v_link from public.provider_account_links
   where provider_slug = p_provider_slug and status in ('pending', 'active')
   order by case when status = 'active' then 0 else 1 end limit 1 for update;
  if found then
    v_workspace_id := v_link.workspace_id;
    if v_link.status = 'pending' then
      update public.provider_account_links
         set status = 'active', proof_method = p_proof_method, proof_subject = p_proof_subject,
             verified_at = case when p_proof_method = 'self_declared' then null else now() end,
             updated_at = now()
       where provider_slug = p_provider_slug and workspace_id = v_workspace_id;
    end if;
  else
    v_workspace_id := public.link_provider_personal_account(p_user_id, p_provider_slug, p_proof_subject, p_proof_method);
  end if;

  return jsonb_build_object(
    'provider', (select to_jsonb(p) from public.v2_providers p where p.provider_slug = p_provider_slug),
    'submission', to_jsonb(v_submission),
    'providerWorkspaceId', v_workspace_id,
    'sourceCreated', not v_source_exists
  );
end;
$$;

revoke all on function public.complete_provider_enrollment(uuid,text,text,jsonb,text,text,text,text,text,jsonb,jsonb,integer,text,text,uuid,text,text,text) from public, anon, authenticated;

grant execute on function public.complete_provider_enrollment(uuid,text,text,jsonb,text,text,text,text,text,jsonb,jsonb,integer,text,text,uuid,text,text,text) to service_role;

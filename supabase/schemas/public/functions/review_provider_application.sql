CREATE OR REPLACE FUNCTION public.review_provider_application (
  p_provider_slug text,
  p_decision      text,
  p_reason        text,
  p_reviewed_by   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
    update public.provider_catalog_sources
    set status = 'paused', refresh_requested = false, next_poll_at = null, updated_at = reviewed_at_value
    where provider_slug = p_provider_slug;
  end if;

  update public.provider_onboarding_submissions
  set pending_webhook_secret_ciphertext = null,
      pending_webhook_secret_iv = null,
      pending_webhook_secret_hash = null
  where id = latest_submission.id;

  select case p_decision
    when 'approved' then 'Your provider claim is approved. Validated catalog updates now apply automatically. Public routing requires configured endpoints, adapters, credentials, and prices.'
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."review_provider_application"(text, text, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."review_provider_application"(text, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."review_provider_application"(text, text, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."review_provider_application"(text, text, text, uuid) FROM PUBLIC, "anon", "authenticated";

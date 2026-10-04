CREATE OR REPLACE FUNCTION public.complete_provider_enrollment (
  p_user_id                   uuid,
  p_provider_slug             text,
  p_provider_name             text,
  p_provider_metadata         jsonb,
  p_website_url               text,
  p_logo_url                  text,
  p_catalog_url               text,
  p_catalog_mode              text,
  p_catalog_sha256            text,
  p_catalog_preview           jsonb,
  p_validation_summary        jsonb,
  p_model_count               integer,
  p_proof_method              text,
  p_proof_subject             text,
  p_claim_challenge_id        uuid    DEFAULT NULL::uuid,
  p_webhook_secret_ciphertext text    DEFAULT NULL::text,
  p_webhook_secret_iv         text    DEFAULT NULL::text,
  p_webhook_secret_hash       text    DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
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
$function$;

GRANT EXECUTE
  ON FUNCTION "public"."complete_provider_enrollment"(uuid, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, integer, text, text, uuid, text, text, text)
  TO "service_role";

REVOKE ALL
  ON FUNCTION "public"."complete_provider_enrollment"(uuid, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, integer, text, text, uuid, text, text, text)
  FROM "postgres";

GRANT EXECUTE
  ON FUNCTION "public"."complete_provider_enrollment"(uuid, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, integer, text, text, uuid, text, text, text)
  TO "postgres";

REVOKE ALL
  ON FUNCTION "public"."complete_provider_enrollment"(uuid, text, text, jsonb, text, text, text, text, text, jsonb, jsonb, integer, text, text, uuid, text, text, text)
  FROM PUBLIC, "anon", "authenticated";

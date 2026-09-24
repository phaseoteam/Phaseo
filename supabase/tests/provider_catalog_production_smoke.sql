begin;

do $smoke$
declare
  missing text[];
  promotion_failed_closed boolean := false;
begin
  select array_agg(required.name order by required.name)
  into missing
  from (values
    ('provider_catalog_sources'),
    ('provider_catalog_sync_runs'),
    ('provider_catalog_sync_models'),
    ('provider_catalog_route_candidates'),
    ('provider_claim_challenges'),
    ('provider_account_links'),
    ('provider_onboarding_submissions'),
    ('provider_catalog_events')
  ) required(name)
  where to_regclass('public.' || required.name) is null;

  if missing is not null then
    raise exception 'Missing provider catalog tables: %', missing;
  end if;

  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.workspaces'::regclass
      and attname = 'workspace_kind'
      and not attisdropped
  ) then
    raise exception 'workspaces.workspace_kind is missing';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'provider_catalog_sources',
        'provider_catalog_sync_runs',
        'provider_catalog_sync_models',
        'provider_catalog_route_candidates',
        'provider_claim_challenges',
        'provider_account_links',
        'provider_onboarding_submissions',
        'provider_catalog_events'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'RLS is not enabled on every provider catalog table';
  end if;

  if has_table_privilege('anon', 'public.provider_claim_challenges', 'select')
     or has_table_privilege('authenticated', 'public.provider_claim_challenges', 'select')
     or has_table_privilege('anon', 'public.provider_catalog_route_candidates', 'select')
     or has_table_privilege('authenticated', 'public.provider_catalog_route_candidates', 'select') then
    raise exception 'Sensitive provider tables are readable by an application role';
  end if;

  if has_function_privilege('anon', 'public.promote_provider_catalog_candidate(uuid,text)', 'execute')
     or has_function_privilege('authenticated', 'public.promote_provider_catalog_candidate(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.claim_provider_catalog_sync(text,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_provider_catalog_sync(text,uuid,integer)', 'execute')
     or has_function_privilege('anon', 'public.renew_provider_catalog_sync(text,uuid,integer)', 'execute')
     or has_function_privilege('authenticated', 'public.renew_provider_catalog_sync(text,uuid,integer)', 'execute') then
    raise exception 'Privileged provider RPC is executable by an application role';
  end if;

  if has_function_privilege('anon', 'public.activate_due_provider_catalog_releases()', 'execute')
     or has_function_privilege('authenticated', 'public.activate_due_provider_catalog_releases()', 'execute') then
    raise exception 'Scheduled provider release RPC is executable by an application role';
  end if;

  if public.claim_provider_catalog_sync(
    '__phaseo_nonexistent_provider_smoke__',
    gen_random_uuid(),
    30
  ) then
    raise exception 'Sync lease unexpectedly succeeded for a nonexistent provider';
  end if;

  if public.renew_provider_catalog_sync(
    '__phaseo_nonexistent_provider_smoke__',
    gen_random_uuid(),
    30
  ) then
    raise exception 'Sync lease renewal unexpectedly succeeded for a nonexistent provider';
  end if;

  if position(
    'provider_model_slug = candidate.provider_model_slug'
    in pg_get_functiondef('public.promote_provider_catalog_candidate(uuid,text)'::regprocedure)
  ) = 0 then
    raise exception 'Candidate promotion does not match routes by provider model identity';
  end if;

  if position(
    'provider_review_status'
    in pg_get_functiondef('public.promote_provider_catalog_candidate(uuid,text)'::regprocedure)
  ) = 0 then
    raise exception 'Candidate promotion does not check self-serve provider approval';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.v2_providers'::regclass
      and tgname = 'enforce_self_serve_provider_review_routing'
      and not tgisinternal
  ) then
    raise exception 'Provider-level routing is not fenced by application approval';
  end if;

  if position(
    'review_status is distinct from ''approved'''
    in pg_get_functiondef('public.enforce_self_serve_provider_approval()'::regprocedure)
  ) = 0 then
    raise exception 'Route-level approval guard does not fail closed for missing or unapproved decisions';
  end if;

  if position(
    'cardinality(activated_ids) > 0'
    in pg_get_functiondef('public.set_self_serve_provider_review(text,text,text,uuid)'::regprocedure)
  ) = 0 then
    raise exception 'Provider approval can enable routing without an activated route';
  end if;

  if position(
    'release_scheduled'
    in pg_get_functiondef('public.activate_due_provider_catalog_releases()'::regprocedure)
  ) = 0 then
    raise exception 'Scheduled provider release function is missing its release gate';
  end if;

  if position(
    'provider_review_status'
    in pg_get_functiondef('public.activate_due_provider_catalog_releases()'::regprocedure)
  ) = 0 then
    raise exception 'Scheduled release does not check self-serve provider approval';
  end if;

  if position(
    'pending_webhook_secret_ciphertext'
    in pg_get_functiondef('public.complete_provider_enrollment(uuid,text,text,jsonb,text,text,text,text,text,jsonb,jsonb,integer,text,text,uuid,text,text,text)'::regprocedure)
  ) = 0 then
    raise exception 'Provider enrollment does not stage claim webhook credentials';
  end if;

  if position(
    'provider_claim_proof_required'
    in pg_get_functiondef('public.complete_provider_enrollment(uuid,text,text,jsonb,text,text,text,text,text,jsonb,jsonb,integer,text,text,uuid,text,text,text)'::regprocedure)
  ) = 0 or position(
    'else ''pending'' end'
    in pg_get_functiondef('public.complete_provider_enrollment(uuid,text,text,jsonb,text,text,text,text,text,jsonb,jsonb,integer,text,text,uuid,text,text,text)'::regprocedure)
  ) = 0 then
    raise exception 'Verified provider claims do not stage ownership links for review';
  end if;

  if position(
    'application_type'
    in pg_get_functiondef('public.review_provider_application(text,text,text,uuid)'::regprocedure)
  ) = 0 then
    raise exception 'Provider application review does not handle existing-provider claims';
  end if;

  if position(
    'provider_review_status = p_decision'
    in pg_get_functiondef('public.review_provider_application(text,text,text,uuid)'::regprocedure)
  ) = 0 then
    raise exception 'Provider application review does not persist decisions for account and catalog gates';
  end if;

  if position(
    'pending_webhook_secret_ciphertext'
    in pg_get_functiondef('public.review_provider_application(text,text,text,uuid)'::regprocedure)
  ) = 0 then
    raise exception 'Claim approval does not transfer staged webhook credentials';
  end if;

  if position(
    '- ''self_serve'''
    in pg_get_functiondef('public.review_provider_application(text,text,text,uuid)'::regprocedure)
  ) = 0 then
    raise exception 'Claim approval does not preserve public provider visibility';
  end if;

  if position(
    'claim_previously_approved'
    in pg_get_functiondef('public.review_provider_application(text,text,text,uuid)'::regprocedure)
  ) = 0 then
    raise exception 'Claim review does not distinguish initial claims from later provider actions';
  end if;

  if position(
    'and link.linked_by = latest_submission.submitted_by'
    in pg_get_functiondef('public.review_provider_application(text,text,text,uuid)'::regprocedure)
  ) = 0 or position(
    'and link.proof_method = ''domain_file'''
    in pg_get_functiondef('public.review_provider_application(text,text,text,uuid)'::regprocedure)
  ) = 0 or position(
    'and link.status = ''active'''
    in pg_get_functiondef('public.review_provider_application(text,text,text,uuid)'::regprocedure)
  ) = 0 or position(
    'previous.provider_review_status = ''approved'''
    in pg_get_functiondef('public.review_provider_application(text,text,text,uuid)'::regprocedure
    )
  ) > 0 then
    raise exception 'Claim actions are not scoped to the latest claimant’s previously approved ownership link';
  end if;

  if position(
    'status = ''revoked'''
    in pg_get_functiondef('public.review_provider_application(text,text,text,uuid)'::regprocedure)
  ) = 0 then
    raise exception 'Claim approval does not transfer or revoke the prior ownership link';
  end if;

  begin
    perform public.promote_provider_catalog_candidate(
      gen_random_uuid(),
      '__phaseo_nonexistent_model_smoke__'
    );
  exception
    when others then
      promotion_failed_closed := sqlerrm = 'provider_catalog_candidate_not_found';
  end;

  if not promotion_failed_closed then
    raise exception 'Candidate promotion did not fail closed';
  end if;
end
$smoke$;

select
  'provider_catalog_production_smoke_passed' as result,
  current_database() as database_name,
  now() as checked_at;

rollback;

CREATE OR REPLACE FUNCTION public.set_self_serve_provider_review (
  p_provider_slug text,
  p_decision      text,
  p_reason        text,
  p_reviewed_by   uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
        and not exists (
          select 1 from public.v2_model_provider_routes stealth_route
          where stealth_route.model_slug = route.model_slug and stealth_route.is_stealth
        )
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
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_self_serve_provider_review"(text, text, text, uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_self_serve_provider_review"(text, text, text, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_self_serve_provider_review"(text, text, text, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_self_serve_provider_review"(text, text, text, uuid) FROM PUBLIC, "anon", "authenticated";

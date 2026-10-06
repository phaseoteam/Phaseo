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

  update public.provider_catalog_sources
  set status = case when p_decision = 'approved' then 'active' else 'paused' end,
      refresh_requested = p_decision = 'approved',
      next_poll_at = case when p_decision = 'approved' then reviewed_at_value else null end,
      updated_at = reviewed_at_value
  where provider_slug = p_provider_slug;

  if p_decision <> 'approved' then
    update public.v2_model_provider_routes set status = case when status = 'retired' then 'retired' else 'disabled' end, routing_enabled = false,
      access_scope = case when phaseo_status in ('blocked', 'unsupported') then access_scope else 'internal' end,
      phaseo_status = case when phaseo_status in ('blocked', 'unsupported') then phaseo_status else 'testing' end,
      provider_availability_status = case when provider_availability_status = 'removed' then 'removed' else 'coming_soon' end, updated_at = reviewed_at_value
    where provider_slug = p_provider_slug and metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_route_variants variant set status = 'disabled', routing_enabled = false, updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where route.provider_slug = p_provider_slug and variant.provider_model_id = route.provider_model_id
      and variant.metadata ->> 'managed_by' = 'provider_catalog';
    update public.v2_route_capabilities capability set status = 'internal_testing', updated_at = reviewed_at_value
    from public.v2_model_provider_routes route
    where route.provider_slug = p_provider_slug and capability.provider_model_id = route.provider_model_id
      and capability.capability_id = public.canonical_routing_capability_id(capability.capability_id)
      and capability.metadata ->> 'managed_by' = 'provider_catalog';
  end if;

  select submitted_by into submitted_by_value
  from public.provider_onboarding_submissions
  where provider_slug = p_provider_slug and submitted_by is not null
  order by created_at desc limit 1;

  review_message_value := case p_decision
    when 'approved' then 'Your provider application is approved. Validated catalog updates now apply automatically. Public routing requires configured endpoints, adapters, credentials, and prices.'
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

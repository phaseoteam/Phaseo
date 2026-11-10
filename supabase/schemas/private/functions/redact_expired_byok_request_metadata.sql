CREATE OR REPLACE FUNCTION private.redact_expired_byok_request_metadata (
  p_apply          boolean DEFAULT false,
  p_batch_size     integer DEFAULT 500,
  p_retention_days integer DEFAULT 365
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '60s'
  SET lock_timeout TO '500ms'
  AS $function$
declare
  v_previous_pruning text := current_setting('phaseo.pruning_byok_metadata', true);
  v_now timestamptz := now();
  v_cutoff timestamptz;
  v_event_ids uuid[];
  v_gateway_ids uuid[];
  v_gateway_created timestamptz[];
  v_eligible integer := 0;
  v_oldest timestamptz;
  v_facts integer := 0;
  v_attempts integer := 0;
  v_traces integer := 0;
  v_gateway integer := 0;
  v_upstream integer := 0;
  v_archives integer := 0;
  v_result jsonb;
begin
  if p_apply is null or p_batch_size is null or p_batch_size < 1 or p_batch_size > 5000
    or p_retention_days is null or p_retention_days < 365 or p_retention_days > 3650 then
    raise exception 'BYOK metadata retention: apply must be set, batch size 1-5000, retention 365-3650 days';
  end if;
  v_cutoff := v_now - make_interval(days => p_retention_days);

  select count(*), min(fact.occurred_at) into v_eligible, v_oldest
  from public.v2_request_facts fact
  where fact.byok and not (fact.safe_metadata ? 'retention_redacted_at')
    and fact.occurred_at < v_cutoff;

  if p_apply and v_eligible > 0 then
    -- Suppress the analytics and public-reporting rebuild queues for these updates:
    -- aggregated usage keeps the totals it already holds.
    perform set_config('phaseo.pruning_byok_metadata', 'on', true);

    select coalesce(array_agg(candidate.request_event_id), '{}'),
      coalesce(array_agg(candidate.gateway_request_id), '{}'),
      coalesce(array_agg(candidate.gateway_request_created_at), '{}')
    into v_event_ids, v_gateway_ids, v_gateway_created
    from (
      select fact.request_event_id, fact.gateway_request_id, fact.gateway_request_created_at
      from public.v2_request_facts fact
      where fact.byok and not (fact.safe_metadata ? 'retention_redacted_at')
        and fact.occurred_at < v_cutoff
      order by fact.occurred_at, fact.request_event_id
      limit p_batch_size
      for update skip locked
    ) candidate;

    -- Keep only the keys that billing, service tier, performance and reporting scope read.
    update public.v2_request_facts fact set
      safe_metadata = coalesce((
          select jsonb_object_agg(entry.key, entry.value)
          from jsonb_each(fact.safe_metadata) entry
          where entry.key = any (array[
            'provider', 'routed_model', 'testing_mode', 'service_tier', 'service_tier_observed',
            'service_tier_requested', 'performance', 'cached_input_tokens_are_subset_of_input',
            'structured_output_success_basis', 'stream_cancellation_support',
            'stream_provider_billing_on_cancel', 'stream_disconnect_action', 'downstream_disconnected'
          ])
        ), '{}'::jsonb) || jsonb_build_object('retention_redacted_at', v_now),
      user_agent = null, sdk_name = null, sdk_version = null, client_version = null,
      session_id = null, end_user_id = null, native_response_id = null,
      edge_country = null, edge_continent = null
    where fact.request_event_id = any (v_event_ids);
    get diagnostics v_facts = row_count;

    update public.v2_request_attempts attempt set
      upstream_response_id = null, upstream_error_message = null, upstream_error_description = null
    where attempt.request_event_id = any (v_event_ids)
      and (attempt.upstream_response_id is not null or attempt.upstream_error_message is not null
        or attempt.upstream_error_description is not null);
    get diagnostics v_attempts = row_count;

    update public.v2_request_routing_traces trace set
      requested_routing = '{}'::jsonb, sticky_routing = '{}'::jsonb
    where trace.request_event_id = any (v_event_ids)
      and (trace.requested_routing <> '{}'::jsonb or trace.sticky_routing <> '{}'::jsonb);
    get diagnostics v_traces = row_count;

    -- The routing archive copy in object storage is removed by the existing deletion queue.
    insert into public.gateway_routing_archive_deletions (object_prefix)
    select 'workspaces/' || request.workspace_id::text || '/routing/v1/' ||
      encode(sha256(convert_to(request.request_id, 'UTF8')), 'hex') || '/'
    from public.gateway_requests request
    join unnest(v_gateway_ids, v_gateway_created) target(id, created_at)
      on request.id = target.id and request.created_at = target.created_at
    on conflict (object_prefix) do nothing;
    get diagnostics v_archives = row_count;

    -- A routing_archive marker without a valid pointer stops the archive backfill
    -- from re-archiving the request; readers treat it as no archive.
    update public.gateway_requests request set
      detail_metadata = jsonb_build_object('routing_archive', jsonb_build_object('redacted_at', v_now)),
      native_response_id = null, error_message = null, error_payload = null, location = null,
      oauth_user_id = null, end_user_id = null, session_id = null, trace_data = null,
      provider_attempts = '[]'::jsonb, realtime_session_id = null,
      attributed_user_id = null, attributed_access_role = null
    from unnest(v_gateway_ids, v_gateway_created) target(id, created_at)
    where request.id = target.id and request.created_at = target.created_at;
    get diagnostics v_gateway = row_count;

    update public.gateway_upstream_requests upstream set
      upstream_url = null, native_response_id = null, error_message = null,
      error_description = null, error_param = null, request_payload = null,
      response_payload = null, metadata = '{}'::jsonb
    from unnest(v_gateway_ids, v_gateway_created) target(id, created_at)
    where upstream.gateway_request_id = target.id
      and upstream.gateway_request_created_at = target.created_at;
    get diagnostics v_upstream = row_count;

    perform set_config('phaseo.pruning_byok_metadata', coalesce(v_previous_pruning, ''), true);
  end if;

  v_result := jsonb_build_object(
    'mode', case when p_apply then 'apply' else 'report' end,
    'cutoff', v_cutoff, 'eligible_requests', v_eligible, 'oldest_eligible_at', v_oldest,
    'facts_redacted', v_facts, 'attempts_redacted', v_attempts,
    'routing_traces_redacted', v_traces, 'gateway_requests_redacted', v_gateway,
    'upstream_attempts_redacted', v_upstream, 'archive_prefixes_queued', v_archives
  );
  if v_eligible > 0 then
    insert into private.byok_metadata_retention_runs (
      mode, cutoff, eligible_requests, oldest_eligible_at, facts_redacted, attempts_redacted,
      routing_traces_redacted, gateway_requests_redacted, upstream_attempts_redacted,
      archive_prefixes_queued
    ) values (
      case when p_apply then 'apply' else 'report' end, v_cutoff, v_eligible, v_oldest,
      v_facts, v_attempts, v_traces, v_gateway, v_upstream, v_archives
    );
  end if;
  return v_result;
exception when others then
  perform set_config('phaseo.pruning_byok_metadata', coalesce(v_previous_pruning, ''), true);
  raise;
end;
$function$;

COMMENT ON FUNCTION "private"."redact_expired_byok_request_metadata"(boolean, integer, integer) IS 'Report-only until approved: counts BYOK requests older than the retention window. With p_apply it redacts request-level metadata (identifiers, client details, error text, payload snapshots, routing archive) in bounded batches and keeps rows, usage, cost and aggregated rollups.';

REVOKE ALL ON FUNCTION "private"."redact_expired_byok_request_metadata"(boolean, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."redact_expired_byok_request_metadata"(boolean, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."redact_expired_byok_request_metadata"(boolean, integer, integer) TO "postgres";

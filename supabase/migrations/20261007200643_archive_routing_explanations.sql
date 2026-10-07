SET local check_function_bodies = off;

CREATE TABLE "public"."gateway_routing_archive_deletions" (
  "object_prefix" text                     NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_routing_archive_deletions_pkey" PRIMARY KEY (object_prefix)
);

ALTER TABLE "public"."gateway_routing_archive_deletions"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."gateway_routing_archive_deletions" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.enqueue_gateway_routing_archive_deletion()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  -- Queue even when no reference exists yet: an upload may be in flight when
  -- retention deletes the source. The prefix includes all immutable revisions.
  insert into public.gateway_routing_archive_deletions(object_prefix) values(
    'workspaces/' || old.workspace_id::text || '/routing/v1/' ||
    encode(sha256(convert_to(old.request_id, 'UTF8')), 'hex') || '/'
  ) on conflict (object_prefix) do nothing;
  return old;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."enqueue_gateway_routing_archive_deletion"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE OR REPLACE FUNCTION public.gateway_commit_routing_archive (
  p_id          uuid,
  p_created_at  timestamp with time zone,
  p_source_hash text,
  p_reference   jsonb
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '5s'
  SET lock_timeout TO '500ms'
  AS $function$
declare
  v_request public.gateway_requests%rowtype;
  v_fact_id uuid;
  v_source jsonb;
begin
  select * into v_request from public.gateway_requests
  where id = p_id and created_at = p_created_at;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_request.workspace_id::text || ':' || v_request.request_id, 0));
  select * into v_request from public.gateway_requests
  where id = p_id and created_at = p_created_at for update;
  if not found then return false; end if;
  if v_request.detail_metadata->'routing_archive' = p_reference then return true; end if;

  if p_reference->>'version' is distinct from '1'
    or coalesce(p_reference->>'sha256', '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_reference->>'bytes', '') !~ '^[0-9]{1,7}$'
    or (p_reference->>'bytes')::integer not between 1 and 1048576
    or p_reference->>'key' is distinct from 'workspaces/' || v_request.workspace_id::text || '/routing/v1/' ||
      encode(sha256(convert_to(v_request.request_id, 'UTF8')), 'hex') || '/' || (p_reference->>'sha256') || '.json' then
    raise exception using errcode = '22023', message = 'routing_archive_reference_invalid';
  end if;
  select request_event_id into v_fact_id from public.v2_request_facts
  where gateway_request_id = p_id and gateway_request_created_at = p_created_at for update;
  perform 1 from public.v2_request_routing_decisions where request_event_id = v_fact_id for update;
  perform 1 from public.v2_request_routing_traces where request_event_id = v_fact_id for update;
  v_source := public.gateway_routing_archive_source(p_id, p_created_at);
  if v_source is null or v_source->>'source_hash' is distinct from p_source_hash then return false; end if;

  update public.gateway_requests
  set detail_metadata = (coalesce(detail_metadata, '{}'::jsonb) - 'routing_snapshot' - 'routing_diagnostics')
    || jsonb_build_object('routing_archive', p_reference)
  where id = p_id and created_at = p_created_at;
  delete from public.v2_request_routing_decisions where request_event_id = v_fact_id;
  delete from public.v2_request_routing_traces where request_event_id = v_fact_id;
  return true;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."gateway_commit_routing_archive"(uuid, timestamp WITH time zone, text, jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_routing_archive_batch (
  p_after_id         uuid,
  p_after_created_at timestamp with time zone,
  p_cutoff           timestamp with time zone,
  p_limit            integer                  DEFAULT 25
)
  RETURNS SETOF jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  SET statement_timeout TO '5s'
  AS $function$
  select public.gateway_routing_archive_source(candidate.id, candidate.created_at)
  from (
    select request.id, request.created_at
    from public.gateway_requests request
    where (request.id, request.created_at) > (p_after_id, p_after_created_at)
      and request.created_at < least(p_cutoff, now() - interval '1 hour')
      and not coalesce(request.detail_metadata ? 'routing_archive', false)
      and (request.detail_metadata ? 'routing_snapshot' or exists (
        select 1 from public.v2_request_facts fact
        join public.v2_request_routing_decisions decision using (request_event_id)
        where fact.gateway_request_id = request.id and fact.gateway_request_created_at = request.created_at
      ))
    order by request.id, request.created_at
    limit greatest(1, least(p_limit, 100))
  ) candidate;
$function$;

REVOKE ALL ON FUNCTION "public"."gateway_routing_archive_batch"(uuid, timestamp WITH time zone, timestamp WITH time zone, integer) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.gateway_routing_archive_source (
  p_id         uuid,
  p_created_at timestamp with time zone
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  with source as (
    select jsonb_build_object(
      'id', request.id, 'created_at', request.created_at,
      'workspace_id', request.workspace_id, 'request_id', request.request_id,
      'metadata', jsonb_build_object(
        'routing_snapshot', request.detail_metadata->'routing_snapshot',
        'routing_diagnostics', request.detail_metadata->'routing_diagnostics'
      ),
      'routing_trace', (select to_jsonb(trace) from public.v2_request_routing_traces trace
        where trace.request_event_id = fact.request_event_id),
      'routing_decisions', coalesce((select jsonb_agg(to_jsonb(routing_row) order by routing_row.decision_order)
        from public.v2_request_routing_decisions routing_row
        where routing_row.request_event_id = fact.request_event_id), '[]'::jsonb)
    ) payload
    from public.gateway_requests request
    left join public.v2_request_facts fact
      on fact.gateway_request_id = request.id and fact.gateway_request_created_at = request.created_at
    where request.id = p_id and request.created_at = p_created_at
      and not coalesce(request.detail_metadata ? 'routing_archive', false)
  )
  select payload || jsonb_build_object('source_hash', md5(payload::text)) from source;
$function$;

REVOKE ALL ON FUNCTION "public"."gateway_routing_archive_source"(uuid, timestamp WITH time zone) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.ingest_v2_gateway_request_with_routing (
  p_event jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_request_event_id uuid;
  v_attempts jsonb := coalesce(p_event->'attempts', '[]'::jsonb);
  v_routing_decisions jsonb := coalesce(p_event->'routing_decisions', '[]'::jsonb);
  v_routing_trace jsonb := coalesce(p_event->'routing_trace', '{}'::jsonb);
begin
  perform pg_advisory_xact_lock(hashtextextended(
    (p_event->>'workspace_id') || ':' || (p_event->>'request_id'), 0
  ));
  if jsonb_typeof(v_routing_decisions) <> 'array'
     or jsonb_array_length(v_routing_decisions) > 128
     or jsonb_typeof(v_routing_trace) <> 'object'
     or pg_column_size(v_routing_trace) > 32768 then
    raise exception using errcode = '22023', message = 'gateway_event_routing_trace_invalid';
  end if;

  v_request_event_id := public.ingest_v2_gateway_request(
    p_event - 'routing_decisions' - 'routing_trace'
  );

  update public.v2_request_attempts attempt
  set provider_model_id = route.provider_model_id
  from jsonb_array_elements(v_attempts) with ordinality as item(value, ordinality)
  cross join lateral (
    select candidate.provider_model_id
    from public.v2_model_provider_routes candidate
    where candidate.provider_model_id = nullif(item.value->>'provider_model_id', '')
       or (
         candidate.provider_slug = nullif(item.value->>'provider', '')
         and candidate.provider_model_id =
           nullif(item.value->>'provider', '') || ':' || nullif(item.value->>'provider_api_model_id', '')
       )
       or (
         candidate.provider_slug = nullif(item.value->>'provider', '')
         and candidate.provider_model_slug = nullif(item.value->>'provider_api_model_id', '')
       )
    order by
      case when candidate.provider_model_id = nullif(item.value->>'provider_model_id', '') then 0 else 1 end,
      candidate.provider_model_id
    limit 1
  ) route
  where attempt.request_event_id = v_request_event_id
    and attempt.attempt_number = greatest(
      1,
      coalesce((item.value->>'attempt_number')::integer, item.ordinality::integer)
    );

  delete from public.v2_request_routing_decisions decision
  where decision.request_event_id = v_request_event_id;

  if jsonb_typeof(p_event->'routing_archive') = 'object' then
    -- The trusted gateway has persisted the complete explanation in R2 before
    -- inserting the authoritative request and its compact object reference.
    delete from public.v2_request_routing_traces
    where request_event_id = v_request_event_id;
    return v_request_event_id;
  end if;

  insert into public.v2_request_routing_decisions (
    request_event_id, decision_order, provider_model_id, provider_slug,
    provider_api_model_id, decision, rank, score, selected, attempted,
    breaker, breaker_until, provider_status, provider_routing_status,
    model_routing_status, capability_status, exclusion_stage, exclusion_reason,
    score_factors, score_trace
  )
  select
    v_request_event_id,
    greatest(1, coalesce((item.value->>'decision_order')::integer, item.ordinality::integer)),
    route.provider_model_id,
    left(nullif(trim(item.value->>'provider'), ''), 256),
    left(nullif(trim(item.value->>'provider_api_model_id'), ''), 512),
    coalesce(nullif(item.value->>'decision', ''), 'ranked'),
    nullif(item.value->>'rank', '')::integer,
    nullif(item.value->>'score', '')::numeric,
    coalesce((item.value->>'selected')::boolean, false),
    coalesce((item.value->>'attempted')::boolean, false),
    left(nullif(item.value->>'breaker', ''), 64),
    case
      when nullif(item.value->>'breaker_until_ms', '') is null then null
      else to_timestamp((item.value->>'breaker_until_ms')::double precision / 1000.0)
    end,
    left(nullif(item.value->>'provider_status', ''), 64),
    left(nullif(item.value->>'provider_routing_status', ''), 64),
    left(nullif(item.value->>'model_routing_status', ''), 64),
    left(nullif(item.value->>'capability_status', ''), 64),
    left(nullif(item.value->>'exclusion_stage', ''), 128),
    left(nullif(item.value->>'exclusion_reason', ''), 256),
    coalesce(item.value->'score_factors', '{}'::jsonb),
    coalesce(item.value->'score_trace', '{}'::jsonb)
  from jsonb_array_elements(v_routing_decisions) with ordinality as item(value, ordinality)
  left join lateral (
    select candidate.provider_model_id
    from public.v2_model_provider_routes candidate
    where candidate.provider_model_id = nullif(item.value->>'provider_model_id', '')
       or (
         candidate.provider_slug = nullif(item.value->>'provider', '')
         and candidate.provider_model_id =
           nullif(item.value->>'provider', '') || ':' || nullif(item.value->>'provider_api_model_id', '')
       )
       or (
         candidate.provider_slug = nullif(item.value->>'provider', '')
         and candidate.provider_model_slug = nullif(item.value->>'provider_api_model_id', '')
       )
    order by
      case when candidate.provider_model_id = nullif(item.value->>'provider_model_id', '') then 0 else 1 end,
      candidate.provider_model_id
    limit 1
  ) route on true
  where nullif(trim(item.value->>'provider'), '') is not null;

  insert into public.v2_request_routing_traces (
    request_event_id, algorithm_version, random_seed, selection_method,
    routing_mode, priority, requested_model, endpoint, final_candidate_count,
    pool_bounds, requested_routing, sticky_routing
  ) values (
    v_request_event_id,
    left(nullif(v_routing_trace#>>'{algorithm,version}', ''), 128),
    nullif(v_routing_trace#>>'{algorithm,seed}', '')::bigint,
    left(nullif(v_routing_trace#>>'{algorithm,selectionMethod}', ''), 64),
    left(nullif(v_routing_trace->>'routing_mode', ''), 64),
    left(nullif(v_routing_trace->>'priority', ''), 64),
    left(nullif(v_routing_trace->>'model', ''), 512),
    left(nullif(v_routing_trace->>'endpoint', ''), 128),
    nullif(v_routing_trace->>'final_candidate_count', '')::integer,
    coalesce(v_routing_trace#>'{algorithm,poolBounds}', '{}'::jsonb),
    coalesce(v_routing_trace->'requested_routing', '{}'::jsonb),
    coalesce(v_routing_trace->'sticky_routing', '{}'::jsonb)
  )
  on conflict (request_event_id) do update set
    algorithm_version = excluded.algorithm_version,
    random_seed = excluded.random_seed,
    selection_method = excluded.selection_method,
    routing_mode = excluded.routing_mode,
    priority = excluded.priority,
    requested_model = excluded.requested_model,
    endpoint = excluded.endpoint,
    final_candidate_count = excluded.final_candidate_count,
    pool_bounds = excluded.pool_bounds,
    requested_routing = excluded.requested_routing,
    sticky_routing = excluded.sticky_routing;

  return v_request_event_id;
end;
$function$;

CREATE INDEX gateway_routing_archive_deletions_created_idx ON public.gateway_routing_archive_deletions USING btree (created_at);

CREATE TRIGGER gateway_requests_routing_archive_delete
  BEFORE DELETE ON public.gateway_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_gateway_routing_archive_deletion();

CREATE POLICY "gateway_routing_archive_deletions_service_delete" ON "public"."gateway_routing_archive_deletions"
  FOR DELETE
  TO "service_role"
  USING (true);

CREATE POLICY "gateway_routing_archive_deletions_service_select" ON "public"."gateway_routing_archive_deletions"
  FOR SELECT
  TO "service_role"
  USING (true);

COMMENT ON TABLE "public"."gateway_routing_archive_deletions" IS 'Durable private-object deletion queue, retained after the source request or workspace disappears.';

REVOKE ALL ON FUNCTION "public"."enqueue_gateway_routing_archive_deletion"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."enqueue_gateway_routing_archive_deletion"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_commit_routing_archive"(uuid, timestamp WITH time zone, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_commit_routing_archive"(uuid, timestamp WITH time zone, text, jsonb) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_commit_routing_archive"(uuid, timestamp WITH time zone, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_routing_archive_batch"(uuid, timestamp WITH time zone, timestamp WITH time zone, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_routing_archive_batch"(uuid, timestamp WITH time zone, timestamp WITH time zone, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_routing_archive_batch"(uuid, timestamp WITH time zone, timestamp WITH time zone, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_routing_archive_source"(uuid, timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_routing_archive_source"(uuid, timestamp WITH time zone) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_routing_archive_source"(uuid, timestamp WITH time zone) TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_routing_archive_deletions" FROM "service_role";

GRANT DELETE, SELECT ON TABLE "public"."gateway_routing_archive_deletions" TO "service_role";

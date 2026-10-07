CREATE OR REPLACE FUNCTION public.gateway_commit_routing_archive(
  p_id uuid, p_created_at timestamptz, p_source_hash text, p_reference jsonb
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
SET statement_timeout TO '5s' SET lock_timeout TO '500ms'
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
REVOKE ALL ON FUNCTION public.gateway_commit_routing_archive(uuid, timestamptz, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gateway_commit_routing_archive(uuid, timestamptz, text, jsonb) TO service_role;

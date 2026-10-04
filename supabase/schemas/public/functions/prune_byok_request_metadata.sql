CREATE OR REPLACE FUNCTION public.prune_byok_request_metadata (
  p_retention_days integer DEFAULT 90,
  p_batch_size     integer DEFAULT 10000
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public', 'pg_temp'
  AS $function$
declare
  v_previous_pruning text := current_setting('phaseo.pruning_byok_metadata', true);
  v_cutoff timestamptz;
  v_v2_deleted integer := 0;
  v_legacy_deleted integer := 0;
begin
  if p_retention_days < 90 or p_retention_days > 3650 then
    raise exception 'BYOK metadata retention must be between 90 and 3650 days';
  end if;
  if p_batch_size < 1 or p_batch_size > 50000 then
    raise exception 'BYOK metadata prune batch size must be between 1 and 50000';
  end if;

  v_cutoff := now() - make_interval(days => p_retention_days);

  perform set_config('phaseo.pruning_byok_metadata', 'on', true);
  with candidates as (
    select facts.request_event_id
    from public.v2_request_facts facts
    where (
        facts.byok is true
        or exists (
          select 1
          from public.v2_request_attempts attempt
          where attempt.request_event_id = facts.request_event_id
            and attempt.safe_metadata->>'key_source' = 'byok'
        )
      )
      and facts.occurred_at < v_cutoff
    order by facts.occurred_at, facts.request_event_id
    limit p_batch_size
  )
  delete from public.v2_request_facts facts
  using candidates
  where facts.request_event_id = candidates.request_event_id;
  get diagnostics v_v2_deleted = row_count;

  with candidates as (
    select requests.id, requests.created_at
    from public.gateway_requests requests
    where (
        requests.byok is true
        or exists (
          select 1
          from public.gateway_upstream_requests attempt
          where attempt.gateway_request_id = requests.id
            and attempt.gateway_request_created_at = requests.created_at
            and attempt.key_source = 'byok'
        )
      )
      and requests.created_at < v_cutoff
    order by requests.created_at, requests.id
    limit p_batch_size
  )
  delete from public.gateway_requests requests
  using candidates
  where requests.id = candidates.id
    and requests.created_at = candidates.created_at;
  get diagnostics v_legacy_deleted = row_count;

  perform set_config('phaseo.pruning_byok_metadata', coalesce(v_previous_pruning, ''), true);
  return jsonb_build_object(
    'cutoff', v_cutoff,
    'v2_deleted', v_v2_deleted,
    'legacy_deleted', v_legacy_deleted
  );
exception when others then
  perform set_config('phaseo.pruning_byok_metadata', coalesce(v_previous_pruning, ''), true);
  raise;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."prune_byok_request_metadata"(integer, integer) TO "service_role";

COMMENT ON FUNCTION "public"."prune_byok_request_metadata"(integer, integer) IS 'Deletes bounded batches of BYOK request-level metadata older than 90 days or an explicitly longer operator-selected window. Child request facts are removed by cascade; aggregate rollups remain.';

REVOKE ALL ON FUNCTION "public"."prune_byok_request_metadata"(integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."prune_byok_request_metadata"(integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."prune_byok_request_metadata"(integer, integer) FROM PUBLIC, "anon", "authenticated";

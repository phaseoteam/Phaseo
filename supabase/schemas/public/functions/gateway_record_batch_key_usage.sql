CREATE OR REPLACE FUNCTION public.gateway_record_batch_key_usage (
  p_workspace_id uuid,
  p_key_id       uuid,
  p_batch_id     text,
  p_provider     text,
  p_rows         jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_inserted integer := 0;
begin
  if p_workspace_id is null or p_key_id is null or coalesce(trim(p_batch_id), '') = '' then
    raise exception 'invalid_batch_key_usage_identity';
  end if;
  if not exists (
    select 1 from public.keys
    where id = p_key_id and workspace_id = p_workspace_id
  ) then
    raise exception 'batch_key_not_owned_by_workspace';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'invalid_batch_key_usage_rows';
  end if;

  delete from public.gateway_requests gr
  where gr.workspace_id = p_workspace_id
    and gr.key_id = p_key_id
    and gr.request_id like 'batch_hold_usage:%'
    and exists (
      select 1
      from public.gateway_wallet_reservations reservation
      where reservation.workspace_id = p_workspace_id
        and reservation.key_id = p_key_id
        and reservation.capture_ref_id = p_batch_id
        and reservation.status = 'captured'
        and gr.request_id like 'batch_hold_usage:' || reservation.reservation_id || ':%'
    );

  with source_rows as (
    select
      coalesce(nullif(trim(row ->> 'custom_id'), ''), ordinality::text) as custom_id,
      coalesce(nullif(trim(row ->> 'endpoint'), ''), 'batch') as endpoint,
      coalesce(nullif(trim(row ->> 'model'), ''), 'batch/unknown') as model,
      greatest(0, coalesce((row ->> 'cost_nanos')::bigint, 0)) as cost_nanos,
      case when jsonb_typeof(row -> 'usage') = 'object' then row -> 'usage' else '{}'::jsonb end as usage
    from jsonb_array_elements(p_rows) with ordinality as entries(row, ordinality)
  ), claimed_rows as (
    insert into public.gateway_batch_key_usage_records (
      workspace_id, batch_id, custom_id, key_id, provider, endpoint, model, cost_nanos, usage
    )
    select
      p_workspace_id, p_batch_id, source.custom_id, p_key_id,
      nullif(trim(coalesce(p_provider, '')), ''), source.endpoint,
      source.model, source.cost_nanos, source.usage
    from source_rows source
    on conflict (workspace_id, batch_id, custom_id) do nothing
    returning custom_id, provider, endpoint, model, cost_nanos, usage
  )
  insert into public.gateway_requests (
    workspace_id, request_id, endpoint, model_id, provider,
    status_code, success, usage, cost_nanos, currency, key_id
  )
  select
    p_workspace_id,
    'batch_usage:' || p_batch_id || ':' || claimed.custom_id,
    claimed.endpoint,
    claimed.model,
    claimed.provider,
    200,
    true,
    claimed.usage,
    claimed.cost_nanos,
    'USD',
    p_key_id
  from claimed_rows claimed;
  get diagnostics v_inserted = row_count;

  update public.gateway_wallet_reservations
  set key_usage_recorded_at = coalesce(key_usage_recorded_at, now()), updated_at = now()
  where workspace_id = p_workspace_id
    and key_id = p_key_id
    and capture_ref_id = p_batch_id
    and status = 'captured';

  return v_inserted;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."gateway_record_batch_key_usage"(uuid, uuid, text, text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."gateway_record_batch_key_usage"(uuid, uuid, text, text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."gateway_record_batch_key_usage"(uuid, uuid, text, text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."gateway_record_batch_key_usage"(uuid, uuid, text, text, jsonb) FROM PUBLIC, "anon", "authenticated";

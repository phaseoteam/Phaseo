-- Durable lifecycle events for both surfaces and discoverable, bounded webhook leases.
create index if not exists gateway_async_webhook_deliveries_claimed_idx
  on public.gateway_async_webhook_deliveries (claimed_at)
  where status = 'claimed';

drop function public.claim_gateway_async_webhook_delivery(uuid, text, text, text, text, integer);
create or replace function public.claim_gateway_async_webhook_delivery(
  p_workspace_id uuid,
  p_kind text,
  p_internal_id text,
  p_delivery_key text,
  p_claim_token text,
  p_stale_after_seconds integer default 300,
  p_event_type text default null, p_phase text default null,
  p_progress double precision default null, p_previous_status text default null, p_current_status text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.gateway_async_webhook_deliveries%rowtype;
begin
  if p_workspace_id is null or coalesce(trim(p_kind), '') = ''
     or coalesce(trim(p_internal_id), '') = '' or coalesce(trim(p_delivery_key), '') = ''
     or coalesce(trim(p_claim_token), '') = '' then
    raise exception 'invalid_webhook_delivery_claim';
  end if;

  insert into public.gateway_async_webhook_deliveries (
    workspace_id, kind, internal_id, delivery_key, status, claim_token, claimed_at, updated_at
  ) values (
    p_workspace_id, p_kind, p_internal_id, p_delivery_key, 'claimed', p_claim_token, now(), now()
  ) on conflict do nothing;

  select * into v_row
  from public.gateway_async_webhook_deliveries
  where workspace_id = p_workspace_id and kind = p_kind
    and internal_id = p_internal_id and delivery_key = p_delivery_key
  for update;

  if v_row.status in ('delivered', 'failed') then return false; end if;
  if v_row.status = 'pending' and v_row.next_attempt_at > now() then return false; end if;
  if v_row.status = 'claimed' and v_row.claim_token <> p_claim_token
     and v_row.claimed_at > now() - make_interval(secs => greatest(30, p_stale_after_seconds)) then
    return false;
  end if;

  update public.gateway_async_webhook_deliveries
  set status = 'claimed', claim_token = p_claim_token, claimed_at = now(), updated_at = now(),
      event_type = coalesce(event_type, p_event_type, split_part(p_delivery_key, ':', 1)),
      phase = coalesce(phase, p_phase, split_part(split_part(p_delivery_key, ':', 1), '.', 2)),
      progress = coalesce(progress, p_progress),
      previous_status = coalesce(previous_status, p_previous_status),
      current_status = coalesce(current_status, p_current_status)
  where workspace_id = p_workspace_id and kind = p_kind
    and internal_id = p_internal_id and delivery_key = p_delivery_key;
  return true;
end;
$$;

revoke all on function public.claim_gateway_async_webhook_delivery(uuid, text, text, text, text, integer, text, text, double precision, text, text) from public, anon, authenticated;
grant execute on function public.claim_gateway_async_webhook_delivery(uuid, text, text, text, text, integer, text, text, double precision, text, text) to service_role;

create or replace function public.gateway_async_operation_video_webhook_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous text;
  v_current text := lower(coalesce(new.status, ''));
  v_terminal_phase text;
begin
  if new.kind not in ('video', 'batch')
     or new.meta->'webhook' is null
     or new.meta->'webhook' = 'null'::jsonb then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.enqueue_gateway_async_webhook_delivery(
      new.workspace_id, new.kind, new.internal_id,
      new.kind || '.created', new.kind || '.created', 'created', null, null, v_current
    );
  end if;

  v_previous := case when tg_op = 'INSERT' then '' else lower(coalesce(old.status, '')) end;
  if v_previous = v_current then return new; end if;

  if tg_op = 'UPDATE' then
  perform public.enqueue_gateway_async_webhook_delivery(
    new.workspace_id, new.kind, new.internal_id,
    new.kind || '.status_changed:' || coalesce(nullif(v_previous, ''), 'unknown') || ':' || coalesce(nullif(v_current, ''), 'unknown'),
    new.kind || '.status_changed', 'status_changed', null,
    nullif(v_previous, ''), nullif(v_current, '')
  );
  end if;

  v_terminal_phase := case v_current
    when 'completed' then 'completed'
    when 'failed' then 'failed'
    when 'cancelled' then 'cancelled'
    when 'canceled' then 'cancelled'
    when 'expired' then 'expired'
    else null
  end;
  if v_terminal_phase is not null then
    perform public.enqueue_gateway_async_webhook_delivery(
      new.workspace_id, new.kind, new.internal_id,
      new.kind || '.' || v_terminal_phase,
      new.kind || '.' || v_terminal_phase,
      v_terminal_phase,
      null,
      nullif(v_previous, ''),
      nullif(v_current, '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists gateway_async_operation_video_webhook_outbox
  on public.gateway_async_operations;
create trigger gateway_async_operation_video_webhook_outbox
after insert or update of status on public.gateway_async_operations
for each row execute function public.gateway_async_operation_video_webhook_outbox();

revoke all on function public.gateway_async_operation_video_webhook_outbox()
  from public, anon, authenticated;


-- Existing first-attempt claims may predate event metadata. Preserve their identity
-- so an expired lease is discoverable without re-enqueuing delivered events.
update public.gateway_async_webhook_deliveries
set event_type = coalesce(event_type, split_part(delivery_key, ':', 1)),
    phase = coalesce(phase, split_part(split_part(delivery_key, ':', 1), '.', 2)),
    claimed_at = coalesce(claimed_at, updated_at)
where status = 'claimed' and kind in ('video', 'batch');


drop function public.record_gateway_async_webhook_result(uuid, text, text, text, jsonb, jsonb, timestamptz, timestamptz, double precision, jsonb);
create or replace function public.record_gateway_async_webhook_result(
  p_workspace_id uuid,
  p_kind text,
  p_internal_id text,
  p_delivery_key text,
  p_attempt jsonb,
  p_retry_state jsonb default null,
  p_delivered_at timestamptz default null,
  p_next_retry_at timestamptz default null,
  p_progress double precision default null,
  p_telemetry_patch jsonb default null,
  p_claim_token text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb;
  v_attempts jsonb;
  v_queue jsonb;
  v_deliveries jsonb;
  v_next_retry_at timestamptz;
  v_telemetry_patch jsonb;
begin
  select coalesce(meta, '{}'::jsonb) into v_meta
  from public.gateway_async_operations
  where workspace_id = p_workspace_id and kind = p_kind and internal_id = p_internal_id
  for update;
  if not found then return; end if;

  -- Lock in the same order as lifecycle updates: operation, then delivery.
  if p_claim_token is not null then
    perform 1 from public.gateway_async_webhook_deliveries
    where workspace_id = p_workspace_id and kind = p_kind
      and internal_id = p_internal_id and delivery_key = p_delivery_key
      and status = 'claimed' and claim_token = p_claim_token
    for update;
    if not found then raise exception 'stale_webhook_delivery_claim'; end if;
  end if;


  v_telemetry_patch := coalesce(p_telemetry_patch, '{}'::jsonb)
    - 'webhookAttempts'
    - 'webhookRetryQueue'
    - 'webhookDeliveries'
    - 'nextWebhookRetryAt'
    - 'lastWebhookDispatchedAt'
    - 'lastWebhookProgress'
    - 'lastWebhookProgressAt';

  v_attempts := coalesce(v_meta->'webhookAttempts', '[]'::jsonb) || jsonb_build_array(p_attempt);
  if jsonb_array_length(v_attempts) > 50 then
    select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
      into v_attempts
    from jsonb_array_elements(v_attempts) with ordinality
    where ordinality > jsonb_array_length(v_attempts) - 50;
  end if;

  v_queue := coalesce(v_meta->'webhookRetryQueue', '{}'::jsonb);
  if p_retry_state is null then
    v_queue := v_queue - p_delivery_key;
  else
    v_queue := jsonb_set(v_queue, array[p_delivery_key], p_retry_state, true);
  end if;

  v_deliveries := coalesce(v_meta->'webhookDeliveries', '{}'::jsonb);
  if p_delivered_at is not null then
    v_deliveries := jsonb_set(v_deliveries, array[p_delivery_key], to_jsonb(p_delivered_at::text), true);
  end if;

  select min(nullif(value->>'nextRetryAt', '')::timestamptz)
    into v_next_retry_at
  from jsonb_each(v_queue);

  v_meta := v_meta || jsonb_build_object(
    'webhookAttempts', v_attempts,
    'webhookRetryQueue', v_queue,
    'webhookDeliveries', v_deliveries,
    'nextWebhookRetryAt', case when v_next_retry_at is null then 'null'::jsonb else to_jsonb(v_next_retry_at::text) end,
    'lastWebhookDispatchedAt', to_jsonb(now()::text)
  ) || v_telemetry_patch;
  if p_progress is not null then
    v_meta := v_meta || jsonb_build_object(
      'lastWebhookProgress', p_progress,
      'lastWebhookProgressAt', to_jsonb(now()::text)
    );
  end if;

  update public.gateway_async_operations
  set meta = v_meta, updated_at = now()
  where workspace_id = p_workspace_id and kind = p_kind and internal_id = p_internal_id;

  update public.gateway_async_webhook_deliveries
  set status = case
        when p_delivered_at is not null then 'delivered'
        when p_next_retry_at is null then 'failed'
        else status
      end,
      claim_token = case when p_next_retry_at is null then null else claim_token end,
      claimed_at = case when p_next_retry_at is null then null else claimed_at end,
      delivered_at = coalesce(p_delivered_at, delivered_at),
      next_attempt_at = p_next_retry_at,
      last_error = p_attempt->>'error_message',
      updated_at = now()
  where workspace_id = p_workspace_id and kind = p_kind
    and internal_id = p_internal_id and delivery_key = p_delivery_key;
end;
$$;
revoke all on function public.record_gateway_async_webhook_result(uuid, text, text, text, jsonb, jsonb, timestamptz, timestamptz, double precision, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_gateway_async_webhook_result(uuid, text, text, text, jsonb, jsonb, timestamptz, timestamptz, double precision, jsonb, text) to service_role;

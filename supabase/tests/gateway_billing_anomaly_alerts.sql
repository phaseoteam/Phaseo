-- Transactional integration test. All fixtures and deliveries roll back.
begin;
do $$
declare
  destination_uuid uuid;
  workspace_uuid uuid;
  operation_uuid uuid := gen_random_uuid();
  batch_uuid uuid := gen_random_uuid();
  alert_uuid uuid;
  event_uuid uuid;
begin
  select id, workspace_id into destination_uuid, workspace_uuid
  from public.notification_destinations where name = 'Billing alerts' and type = 'slack' and status = 'active' limit 1;
  if destination_uuid is null then raise exception 'Test requires an active Billing alerts Slack destination'; end if;
  update public.gateway_billing_alert_config set destination_id = destination_uuid;
  insert into public.gateway_async_operations(id, workspace_id, internal_id, kind, provider, status, meta)
  values(operation_uuid, workspace_uuid, 'rollback-video-' || operation_uuid, 'video', 'test', 'completed',
    '{"billingReason":"unexpected_zero_cost"}');
  select id, event_id into alert_uuid, event_uuid from public.gateway_billing_alerts where operation_id = operation_uuid;
  if event_uuid is null then raise exception 'No delivery was queued'; end if;
  update public.gateway_async_operations set meta = meta where id = operation_uuid;
  if public.queue_gateway_billing_alert(alert_uuid) then raise exception 'Duplicate dispatch was queued'; end if;
  if (select count(*) from public.gateway_billing_alerts where operation_id = operation_uuid) <> 1 then raise exception 'Duplicate alert'; end if;
  if (select count(*) from public.notification_delivery_attempts where event_id = event_uuid) <> 1 then raise exception 'Duplicate attempt'; end if;
  if not exists(select 1 from public.email_outbox where id = event_uuid and sent_at is not null and kind = 'billing_anomaly') then raise exception 'Legacy email drain not suppressed'; end if;
  update public.gateway_async_operations set billed_at = now() where id = operation_uuid;
  if not exists(select 1 from public.gateway_billing_alerts where id = alert_uuid and status = 'resolved' and resolved_at is not null) then raise exception 'Alert was not resolved'; end if;

  -- A legitimate zero-cost completion produces no anomaly.
  insert into public.gateway_async_operations(id, workspace_id, internal_id, kind, provider, status, meta)
  values(batch_uuid, workspace_uuid, 'rollback-batch-' || batch_uuid, 'batch', 'test', 'completed', '{"billingReason":"zero_cost"}');
  if exists(select 1 from public.gateway_billing_alerts where operation_id = batch_uuid) then raise exception 'Free job incorrectly alerted'; end if;
  -- Missing destination still retains durable evidence, then queues on recovery.
  update public.gateway_billing_alert_config set destination_id = null;
  update public.gateway_async_operations set meta = '{"billingReason":"unexpected_zero_cost"}' where id = batch_uuid;
  select id, event_id into alert_uuid, event_uuid from public.gateway_billing_alerts where operation_id = batch_uuid;
  if alert_uuid is null or event_uuid is not null then raise exception 'Missing-route persistence failed'; end if;
  update public.gateway_billing_alert_config set destination_id = destination_uuid;
  if not public.queue_gateway_billing_alert(alert_uuid) then raise exception 'Recovery did not queue'; end if;
  if has_table_privilege('authenticated', 'public.gateway_billing_alerts', 'SELECT') then raise exception 'Customer can read operations alerts'; end if;
  if has_function_privilege('authenticated', 'public.queue_gateway_billing_alert(uuid)', 'EXECUTE') then raise exception 'Customer can queue operations alerts'; end if;
end $$;
rollback;

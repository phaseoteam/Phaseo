-- Run against a migrated disposable database. All fixtures roll back.
begin;
do $$
declare
  w uuid := '00000000-0000-4000-8000-000000000099';
  k text;
  n integer;
begin
  foreach k in array array['video', 'batch'] loop
    insert into public.gateway_async_operations(workspace_id, kind, internal_id, status, meta)
    values (w, k, 'recovery-test', 'queued', '{"webhook":{"url":"https://example.com/hook"}}');
    update public.gateway_async_operations set status = 'completed', billed_at = now()
    where workspace_id = w and kind = k and internal_id = 'recovery-test';
    update public.gateway_async_operations set status = 'completed'
    where workspace_id = w and kind = k and internal_id = 'recovery-test';
    select count(*) into n from public.gateway_async_webhook_deliveries
    where workspace_id = w and kind = k and internal_id = 'recovery-test';
    if n <> 3 then raise exception 'expected created, status_changed and completed for %, got %', k, n; end if;

    if not public.claim_gateway_async_webhook_delivery(w,k,'recovery-test',k||'.completed','old') then
      raise exception 'initial claim failed';
    end if;
    if public.claim_gateway_async_webhook_delivery(w,k,'recovery-test',k||'.completed','new') then
      raise exception 'live lease stolen';
    end if;
    update public.gateway_async_webhook_deliveries set claimed_at = now() - interval '6 minutes'
    where workspace_id = w and kind = k and delivery_key = k||'.completed';
    if not public.claim_gateway_async_webhook_delivery(w,k,'recovery-test',k||'.completed','new') then
      raise exception 'expired lease not recovered';
    end if;
    begin
      perform public.record_gateway_async_webhook_result(w,k,'recovery-test',k||'.completed','{}',p_delivered_at=>now(),p_claim_token=>'old');
      raise exception 'old worker overwrote recovered claim';
    exception when others then
      if sqlerrm <> 'stale_webhook_delivery_claim' then raise; end if;
    end;
    perform public.record_gateway_async_webhook_result(w,k,'recovery-test',k||'.completed','{"status":"delivered"}',p_delivered_at=>now(),p_claim_token=>'new');
    if public.claim_gateway_async_webhook_delivery(w,k,'recovery-test',k||'.completed','again') then
      raise exception 'delivered event reclaimed';
    end if;

    -- A first-attempt progress claim has no lifecycle-trigger row or retry metadata.
    perform public.claim_gateway_async_webhook_delivery(w,k,'recovery-test',k||'.progress:50','first',300,k||'.progress','progress',50);
    select count(*) into n from public.gateway_async_webhook_deliveries
    where workspace_id = w and kind = k and delivery_key = k||'.progress:50'
      and event_type = k||'.progress' and phase = 'progress' and progress = 50;
    if n <> 1 then raise exception 'first claim is not discoverable'; end if;
    update public.gateway_async_webhook_deliveries set status='failed'
    where workspace_id=w and kind=k and delivery_key=k||'.progress:50';
    if public.claim_gateway_async_webhook_delivery(w,k,'recovery-test',k||'.progress:50','again') then
      raise exception 'permanent failure reclaimed';
    end if;
    update public.gateway_async_webhook_deliveries set next_attempt_at=now()+interval '1 hour'
    where workspace_id=w and kind=k and delivery_key=k||'.created';
    if public.claim_gateway_async_webhook_delivery(w,k,'recovery-test',k||'.created','early') then
      raise exception 'future retry claimed early';
    end if;

    insert into public.gateway_async_operations(workspace_id,kind,internal_id,status,meta)
    values(w,k,'terminal-insert','expired','{"webhook":{"url":"https://example.com/hook"}}');
    select count(*) into n from public.gateway_async_webhook_deliveries
    where workspace_id=w and kind=k and internal_id='terminal-insert' and phase='expired';
    if n <> 1 then raise exception 'initial terminal event missing'; end if;
  end loop;
end;
$$;
rollback;

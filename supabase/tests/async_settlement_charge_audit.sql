-- Supply an owner test workspace with SET LOCAL phaseo.test_workspace_id.
-- Run inside BEGIN/ROLLBACK; no fixture may be committed.
do $$
declare
  w uuid := current_setting('phaseo.test_workspace_id')::uuid;
  prefix text := 'audit-test-' || gen_random_uuid()::text;
  rid text;
  actual bigint;
  before_balance bigint;
  before_reserved bigint;
  baseline_balance bigint;
  baseline_reserved bigint;
  result record;
  reservation record;
  ledger record;
  n integer;
begin
  select balance_nanos, reserved_nanos into strict baseline_balance, baseline_reserved
  from public.wallets where workspace_id=w for update;
  foreach actual in array array[100,40,150,0,-1]::bigint[] loop
    rid := prefix || ':' || actual;
    select balance_nanos,reserved_nanos into before_balance,before_reserved from public.wallets where workspace_id=w;
    insert into public.gateway_wallet_reservations(workspace_id,reservation_id,amount_nanos,status)
    values(w,rid,100,'reserved');
    update public.wallets set reserved_nanos=reserved_nanos+100 where workspace_id=w;
    if actual=100 then
      select * into result from public.gateway_wallet_capture_once(w,rid,rid);
    elsif actual=-1 then
      select * into result from public.gateway_wallet_release_once(w,rid,rid);
    else
      select * into result from public.gateway_wallet_settle_once(w,rid,actual,rid);
    end if;
    if not result.ok or not result.applied then raise exception 'settlement failed for %', actual; end if;
    if result.after_balance_nanos <> before_balance-greatest(0,actual) or result.after_reserved_nanos <> before_reserved then
      raise exception 'wallet mismatch for %',actual;
    end if;
    select count(*) into n from public.credit_ledger where ref_type='async_job_charge' and ref_id=w::text||':'||rid;
    if n <> (case when actual>0 then 1 else 0 end) then raise exception 'ledger count mismatch for %',actual; end if;
    if actual>0 then
      select * into strict ledger from public.credit_ledger where ref_type='async_job_charge' and ref_id=w::text||':'||rid;
      if ledger.kind<>'charge' or ledger.amount_nanos<>-actual or ledger.before_balance_nanos<>before_balance
        or ledger.after_balance_nanos<>before_balance-actual then raise exception 'ledger amounts mismatch'; end if;
    end if;
    select * into reservation from public.gateway_wallet_reservations where workspace_id=w and reservation_id=rid;
    if reservation.captured_nanos<>least(100,greatest(0,actual)) or reservation.released_nanos<>100-least(100,greatest(0,actual)) then
      raise exception 'reservation counters mismatch for %',actual;
    end if;
    -- Replaying the same operation must neither debit nor append another charge.
    if actual=100 then
      select * into result from public.gateway_wallet_capture_once(w,rid,rid);
    elsif actual=-1 then
      select * into result from public.gateway_wallet_release_once(w,rid,rid);
    else
      select * into result from public.gateway_wallet_settle_once(w,rid,actual,rid);
    end if;
    if not result.ok or result.applied or result.before_balance_nanos<>result.after_balance_nanos then
      raise exception 'replay was not idempotent';
    end if;
    select count(*) into n from public.credit_ledger where ref_type='async_job_charge' and ref_id=w::text||':'||rid;
    if n <> (case when actual>0 then 1 else 0 end) then raise exception 'replay duplicated charge'; end if;
  end loop;

  -- Historical held rows support capture and release, just like reserved rows.
  foreach actual in array array[100,-1]::bigint[] loop
    rid := prefix || ':held:' || actual;
    insert into public.gateway_wallet_reservations(workspace_id,reservation_id,amount_nanos,status) values(w,rid,100,'held');
    update public.wallets set reserved_nanos=reserved_nanos+100 where workspace_id=w;
    if actual=100 then
      select * into result from public.gateway_wallet_capture_once(w,rid,rid);
    else
      select * into result from public.gateway_wallet_release_once(w,rid,rid);
    end if;
    if not result.ok or not result.applied then raise exception 'historical held row rejected'; end if;
  end loop;

  -- A Video replay reports the first debit after recomputation changes, without
  -- another debit or ledger entry. Capture replay also returns the settled cost.
  rid := 'video_hold:' || prefix || ':replay';
  insert into public.gateway_wallet_reservations(workspace_id,reservation_id,amount_nanos,status) values(w,rid,100,'held');
  update public.wallets set reserved_nanos=reserved_nanos+100 where workspace_id=w;
  perform public.gateway_wallet_settle_once(w,rid,40,rid);
  select * into result from public.gateway_wallet_settle_once(w,rid,60,rid);
  if not result.ok or result.applied or result.amount_nanos<>40 or result.before_balance_nanos<>result.after_balance_nanos then
    raise exception 'video replay lost authoritative debit';
  end if;
  select * into result from public.gateway_wallet_capture_once(w,rid,rid);
  if not result.ok or result.applied or result.amount_nanos<>40 then raise exception 'capture replay lost settled cost'; end if;
  select count(*) into n from public.credit_ledger where ref_type='async_job_charge' and ref_id=w::text||':'||rid;
  if n<>1 then raise exception 'video replay duplicated ledger charge'; end if;

  -- A settlement cannot spend credits reserved for other jobs.
  rid:=prefix||':insufficient';
  select balance_nanos,reserved_nanos into before_balance,before_reserved from public.wallets where workspace_id=w;
  insert into public.gateway_wallet_reservations(workspace_id,reservation_id,amount_nanos,status) values(w,rid,100,'reserved');
  update public.wallets set reserved_nanos=reserved_nanos+100 where workspace_id=w;
  select * into result from public.gateway_wallet_settle_once(w,rid,before_balance-before_reserved+1,rid);
  if result.ok or result.applied or result.reason<>'insufficient_balance' then raise exception 'overspend was accepted'; end if;
  select * into result from public.wallets where workspace_id=w;
  if result.balance_nanos<>before_balance or result.reserved_nanos<>before_reserved+100 then raise exception 'rejected settlement changed wallet'; end if;
  if exists(select 1 from public.credit_ledger where ref_type='async_job_charge' and ref_id=w::text||':'||rid) then raise exception 'rejected settlement created a charge'; end if;

  -- Force a ledger uniqueness failure and prove the debit/status update rolls back.
  rid:=prefix||':conflict';
  select balance_nanos,reserved_nanos into before_balance,before_reserved from public.wallets where workspace_id=w;
  insert into public.gateway_wallet_reservations(workspace_id,reservation_id,amount_nanos,status) values(w,rid,100,'reserved');
  update public.wallets set reserved_nanos=reserved_nanos+100 where workspace_id=w;
  insert into public.credit_ledger(workspace_id,kind,amount_nanos,before_balance_nanos,after_balance_nanos,ref_type,ref_id)
  values(w,'charge',-100,before_balance,before_balance-100,'async_job_charge',w::text||':'||rid);
  begin
    perform public.gateway_wallet_capture_once(w,rid,rid);
    raise exception 'expected ledger conflict';
  exception when unique_violation then null;
  end;
  select * into result from public.wallets where workspace_id=w;
  select * into reservation from public.gateway_wallet_reservations where workspace_id=w and reservation_id=rid;
  if result.balance_nanos<>before_balance or result.reserved_nanos<>before_reserved+100 or reservation.status<>'reserved' then
    raise exception 'ledger failure did not roll back settlement';
  end if;
end;
$$;

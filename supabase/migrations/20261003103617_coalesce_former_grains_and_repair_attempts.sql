-- phaseo:allow-destructive-migration reason: coalesces duplicate derived repair signals only; source facts and financial records are unchanged.
set local lock_timeout='500ms';
set local statement_timeout='10s';
alter table private.v2_analytics_previous_grains add column transaction_id bigint not null default txid_current();
update private.v2_analytics_previous_grains
set occurred_at=date_trunc('hour',occurred_at at time zone 'utc') at time zone 'utc';
delete from private.v2_analytics_previous_grains q using (
  select grain_id,row_number() over(partition by workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo
    order by queued_at,grain_id) position from private.v2_analytics_previous_grains
) duplicates where q.grain_id=duplicates.grain_id and duplicates.position>1;
create unique index v2_analytics_previous_grains_identity_idx on private.v2_analytics_previous_grains
  (workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo) nulls not distinct;

create or replace function private.enqueue_v2_analytics_fact_correction()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(current_setting('phaseo.pruning_byok_metadata',true),'')='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if coalesce(old.routed_model_slug,old.requested_model_slug) is not null and (tg_op='DELETE' or row(old.workspace_id,date_trunc('hour',old.occurred_at at time zone 'utc'),old.app_id,
    coalesce(old.routed_model_slug,old.requested_model_slug),old.provider_model_id,old.cloudflare_colo)
    is distinct from row(new.workspace_id,date_trunc('hour',new.occurred_at at time zone 'utc'),new.app_id,
    coalesce(new.routed_model_slug,new.requested_model_slug),new.provider_model_id,new.cloudflare_colo)) then
    insert into private.v2_analytics_previous_grains as queued(workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo)
    values(old.workspace_id,date_trunc('hour',old.occurred_at at time zone 'utc') at time zone 'utc',old.app_id,
      coalesce(old.routed_model_slug,old.requested_model_slug),old.provider_model_id,old.cloudflare_colo)
    on conflict(workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo) do update
    set grain_id=excluded.grain_id,transaction_id=excluded.transaction_id
    where queued.transaction_id<>excluded.transaction_id;
  end if;
  if tg_op='DELETE' then return old; end if;
  if old is distinct from new then perform private.enqueue_v2_analytics_correction(new.request_event_id); end if;
  return new;
end;
$$;

-- Attempts affect the processor's upstream/failed-attempt counters. The child
-- trigger already handles old/new request IDs and retention suppression.
create trigger v2_request_attempts_analytics_correction after insert or update or delete on public.v2_request_attempts
for each row execute function private.enqueue_v2_analytics_meter_correction();

-- Existing pooled sessions might have the pre-migration temporary shape.
do $migration$
declare
  definition text := pg_get_functiondef('public.process_v2_analytics_outbox(integer)'::regprocedure);
  old_claim text := '  insert into pg_temp.v2_previous_grain_batch' || chr(10) || '  select previous.*';
  new_claim text := '  alter table pg_temp.v2_previous_grain_batch add column if not exists transaction_id bigint;' || chr(10) ||
    '  insert into pg_temp.v2_previous_grain_batch(grain_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo,queued_at,transaction_id)' || chr(10) || '  select previous.*';
begin
  if position(old_claim in definition)=0 then raise exception 'Unexpected former-grain claim definition'; end if;
  execute replace(definition,old_claim,new_claim);
end;
$migration$;

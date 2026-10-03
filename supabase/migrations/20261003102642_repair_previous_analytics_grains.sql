-- phaseo:allow-destructive-migration reason: recomputes only derived analytics grains affected by explicit fact corrections; retention pruning preserves durable aggregates.
set local lock_timeout = '500ms';
set local statement_timeout = '10s';
create table private.v2_analytics_previous_grains (
  grain_id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  occurred_at timestamptz not null,
  app_id uuid,
  model_slug text,
  provider_model_id text,
  cloudflare_colo text,
  queued_at timestamptz not null default clock_timestamp()
);
create index v2_analytics_previous_grains_oldest_idx on private.v2_analytics_previous_grains(queued_at,grain_id);
alter table private.v2_analytics_previous_grains enable row level security;
revoke all on private.v2_analytics_previous_grains from public,anon,authenticated,service_role;

create or replace function private.enqueue_v2_analytics_fact_correction()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if coalesce(current_setting('phaseo.pruning_byok_metadata',true),'')='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' or row(old.workspace_id,old.occurred_at,old.app_id,
    coalesce(old.routed_model_slug,old.requested_model_slug),old.provider_model_id,old.cloudflare_colo)
    is distinct from row(new.workspace_id,new.occurred_at,new.app_id,
    coalesce(new.routed_model_slug,new.requested_model_slug),new.provider_model_id,new.cloudflare_colo) then
    insert into private.v2_analytics_previous_grains(workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo)
    values(old.workspace_id,old.occurred_at,old.app_id,coalesce(old.routed_model_slug,old.requested_model_slug),old.provider_model_id,old.cloudflare_colo);
  end if;
  if tg_op='DELETE' then return old; end if;
  if old is distinct from new then perform private.enqueue_v2_analytics_correction(new.request_event_id); end if;
  return new;
end;
$$;
drop trigger v2_request_facts_analytics_correction on public.v2_request_facts;
create trigger v2_request_facts_analytics_correction after update or delete on public.v2_request_facts
for each row execute function private.enqueue_v2_analytics_fact_correction();

-- Reuse the established processor's metric queries for OLD identities, even
-- when their final source request has moved away. Claim only one former grain
-- alongside each existing bounded outbox batch, never scan historical ranges.
do $migration$
declare
  definition text := pg_get_functiondef('public.process_v2_analytics_outbox(integer)'::regprocedure);
  claim_marker text := '  get diagnostics v_selected = row_count;';
  ack_marker text := '  return jsonb_build_object(';
  claim_sql text := $patch$
  get diagnostics v_selected = row_count;
  create temporary table if not exists pg_temp.v2_previous_grain_batch
    (like private.v2_analytics_previous_grains including defaults) on commit drop;
  truncate table pg_temp.v2_previous_grain_batch;
  insert into pg_temp.v2_previous_grain_batch
  select previous.* from private.v2_analytics_previous_grains previous
  order by previous.queued_at,previous.grain_id for update skip locked limit 1;
  insert into pg_temp.v2_rollup_batch
    (request_event_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo)
  select grain_id,workspace_id,occurred_at,app_id,model_slug,provider_model_id,cloudflare_colo
  from pg_temp.v2_previous_grain_batch;
  v_selected := v_selected + (select count(*) from pg_temp.v2_previous_grain_batch);
$patch$;
  ack_sql text := $patch$
  delete from private.v2_analytics_previous_grains
  where grain_id in (select grain_id from pg_temp.v2_previous_grain_batch);
  return jsonb_build_object($patch$;
begin
  if position(claim_marker in definition)=0 or position(ack_marker in definition)=0 then
    raise exception 'Unexpected V2 analytics processor definition; former-grain repair not installed';
  end if;
  definition := replace(definition,claim_marker,claim_sql);
  -- The processor has an early empty-batch return as well. Do not touch it.
  definition := replace(definition, E'\n  return jsonb_build_object(', E'\n' || ack_sql);
  execute definition;
end;
$migration$;
comment on table private.v2_analytics_previous_grains is
  'Former fact identities from explicit corrections/deletions; one claimed per bounded V2 worker call, acknowledged only after atomic recomputation. Metadata retention never queues repairs.';

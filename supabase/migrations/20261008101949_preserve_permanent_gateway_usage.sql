-- Restored from Phaseo Prod migration records; already applied as version 20261008101949.
-- phaseo:allow-production-history-backfill reason: Record the migration already applied to production from a local checkout so db push history matches.
-- Preserve historical usage identity independently of live accounts/workspaces.
set local lock_timeout = '1s';
set local statement_timeout = '60s';

create table private.usage_workspace_identity (
  workspace_id uuid primary key
);
alter table private.usage_workspace_identity enable row level security;
revoke all on private.usage_workspace_identity from public, anon, authenticated;
grant select on private.usage_workspace_identity to service_role;
create policy deny_direct_client_access on private.usage_workspace_identity
  for all to anon, authenticated using (false) with check (false);
comment on table private.usage_workspace_identity is
  'Permanent workspace UUIDs for usage and accounting history; contains no account identity or access grants.';

insert into private.usage_workspace_identity (workspace_id)
select id from public.workspaces;

create function private.capture_usage_workspace_identity()
returns trigger language plpgsql security definer set search_path = ''
as $function$
begin
  insert into private.usage_workspace_identity (workspace_id)
  values (new.id) on conflict do nothing;
  return new;
end;
$function$;
revoke all on function private.capture_usage_workspace_identity() from public, anon, authenticated;
create trigger aaa_workspaces_capture_usage_identity
  after insert on public.workspaces
  for each row execute function private.capture_usage_workspace_identity();

do $foreign_keys$
declare
  dependency record;
begin
  for dependency in
    select c.conrelid::regclass as relation, c.conname
    from pg_constraint c
    join pg_class relation on relation.oid = c.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where c.contype = 'f' and c.conparentid = 0
      and c.confrelid = 'public.workspaces'::regclass
      and namespace.nspname = 'public'
      and relation.relname in (
        'gateway_requests', 'gateway_upstream_requests', 'v2_request_facts',
        'v2_private_usage_daily', 'v2_analytics_outbox',
        'credit_ledger', 'v2_credit_ledger', 'gateway_request_charges',
        'gateway_wallet_reservations', 'v2_credit_reservations',
        'gateway_batch_key_usage_records', 'workspace_byok_monthly_usage',
        'workspace_byok_monthly_usage_events',
        'public_model_user_usage_daily', 'public_model_workspace_usage_weekly'
      )
  loop
    execute format('alter table %s drop constraint %I', dependency.relation, dependency.conname);
    execute format(
      'alter table %s add constraint %I foreign key (workspace_id) references private.usage_workspace_identity(workspace_id) on delete restrict',
      dependency.relation, dependency.conname
    );
  end loop;
end;
$foreign_keys$;

-- Retain the RPC signature for existing operators; permanent usage has no expiry.
create or replace function public.prune_byok_request_metadata(
  p_retention_days integer default 90, p_batch_size integer default 10000
)
returns jsonb language plpgsql security invoker set search_path = ''
as $function$
begin
  if p_retention_days is null or p_retention_days < 90 or p_retention_days > 3650
    or p_batch_size is null or p_batch_size < 1 or p_batch_size > 50000 then
    raise exception 'Invalid BYOK metadata prune parameters';
  end if;
  return jsonb_build_object('cutoff', now() - make_interval(days => p_retention_days),
    'v2_deleted', 0, 'legacy_deleted', 0, 'retention_policy', 'permanent_usage');
end;
$function$;
revoke all on function public.prune_byok_request_metadata(integer, integer) from public, anon, authenticated;
grant execute on function public.prune_byok_request_metadata(integer, integer) to service_role;
comment on function public.prune_byok_request_metadata(integer, integer) is
  'Compatibility no-op: gateway and normalized usage records are retained permanently.';
do $schedule$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'prune-byok-request-metadata';
end;
$schedule$;

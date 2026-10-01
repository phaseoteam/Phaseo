-- Durable cache-publication intent, atomically recorded with control-plane
-- mutations. No inference, key last-used or financial-ledger writes land here.
-- phaseo:allow-destructive-migration reason: DELETE is confined to the new queue's lease-and-revision-checked acknowledgement function; applying this migration deletes no existing data.
create table if not exists public.gateway_workspace_publications (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp(),
  available_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0 check (attempts between 0 and 10),
  lease_id uuid,
  lease_until timestamptz,
  constraint gateway_workspace_publications_lease_pair
    check ((lease_id is null) = (lease_until is null))
);
create index if not exists gateway_workspace_publications_due
  on public.gateway_workspace_publications (available_at, workspace_id) where attempts < 10;
alter table public.gateway_workspace_publications enable row level security;
revoke all on public.gateway_workspace_publications from public, anon, authenticated;
grant select, insert, update, delete on public.gateway_workspace_publications to service_role;
comment on table public.gateway_workspace_publications is
  'One coalesced cache-publication intent per workspace; contains no credentials or customer payloads. Ten failed/abandoned attempts require operator attention or a new mutation.';

create or replace function private.enqueue_gateway_workspace_publication(p_workspace_id uuid)
returns void language sql security definer set search_path = '' as $function$
  insert into public.gateway_workspace_publications as pending (workspace_id)
    select w.id from public.workspaces w where w.id = p_workspace_id
  on conflict (workspace_id) do update set
    revision = gen_random_uuid(), available_at = clock_timestamp(), attempts = 0;
  -- Preserve an active lease. Its acknowledgement must compare the revision.
$function$;
revoke all on function private.enqueue_gateway_workspace_publication(uuid) from public, anon, authenticated, service_role;

create or replace function private.capture_gateway_workspace_publication()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  old_row jsonb;
  new_row jsonb;
  target uuid;
begin
  if tg_op <> 'INSERT' then old_row := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then new_row := to_jsonb(new); end if;
  -- Advisory BYOK usage updates must never create publication traffic.
  if tg_op = 'UPDATE' and
    (old_row - array['updated_at','last_used_at']) is not distinct from
    (new_row - array['updated_at','last_used_at']) then return null; end if;
  for target in
    select distinct id from (
      select case
        when tg_table_name = 'workspaces' then (r->>'id')::uuid
        when tg_table_name = 'key_guardrails' then
          (select g.workspace_id from public.workspace_guardrails g where g.id = (r->>'guardrail_id')::uuid)
        when tg_table_name = 'gateway_dynamic_route_keys' then
          (select d.workspace_id from public.gateway_dynamic_routes d where d.id = (r->>'route_id')::uuid)
        else (r->>'workspace_id')::uuid end as id
      from (values(old_row),(new_row)) rows(r) where r is not null
    ) targets where id is not null order by id
  loop
    perform private.enqueue_gateway_workspace_publication(target);
  end loop;
  return null;
end;
$function$;
revoke all on function private.capture_gateway_workspace_publication() from public, anon, authenticated, service_role;

do $block$
declare source_table text;
begin
  foreach source_table in array array['workspace_settings','byok_keys','workspace_private_models',
    'workspace_guardrails','key_guardrails','workspace_member_guardrails',
    'gateway_dynamic_routes','gateway_dynamic_route_keys']
  loop
    execute format('drop trigger if exists gateway_workspace_publication on public.%I', source_table);
    execute format('create trigger gateway_workspace_publication after insert or update or delete on public.%I
      for each row execute function private.capture_gateway_workspace_publication()', source_table);
  end loop;
end;
$block$;
drop trigger if exists gateway_workspace_publication on public.workspaces;
create trigger gateway_workspace_publication after update of tier, billing_mode on public.workspaces
  for each row when (old.tier is distinct from new.tier or old.billing_mode is distinct from new.billing_mode)
  execute function private.capture_gateway_workspace_publication();

create or replace function public.gateway_claim_workspace_publications(
  p_limit integer default 25, p_workspace_id uuid default null
) returns table(workspace_id uuid, revision uuid, lease_id uuid)
language plpgsql security invoker set search_path = '' as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'invalid_publication_limit' using errcode='22023';
  end if;
  -- The existing authenticated explicit-invalidation route can also request
  -- publication when there was no preceding mutation. A busy lease is not stolen.
  if p_workspace_id is not null then
    insert into public.gateway_workspace_publications (workspace_id)
      select w.id from public.workspaces w where w.id = p_workspace_id
      on conflict on constraint gateway_workspace_publications_pkey do nothing;
  end if;
  return query
  with due as (
    select p.workspace_id from public.gateway_workspace_publications p
    where p.attempts < 10 and p.available_at <= clock_timestamp()
      and (p.lease_until is null or p.lease_until <= clock_timestamp())
      and (p_workspace_id is null or p.workspace_id = p_workspace_id)
    order by p.available_at, p.workspace_id limit p_limit for update skip locked
  )
  update public.gateway_workspace_publications p set
    lease_id = gen_random_uuid(), lease_until = clock_timestamp() + interval '3 minutes',
    attempts = p.attempts + 1
  from due where p.workspace_id = due.workspace_id
  returning p.workspace_id, p.revision, p.lease_id;
end;
$function$;
revoke all on function public.gateway_claim_workspace_publications(integer,uuid) from public, anon, authenticated;
grant execute on function public.gateway_claim_workspace_publications(integer,uuid) to service_role;

create or replace function public.gateway_finish_workspace_publication(
  p_workspace_id uuid, p_revision uuid, p_lease_id uuid, p_success boolean
) returns text language plpgsql security invoker set search_path = '' as $function$
declare pending public.gateway_workspace_publications%rowtype;
begin
  if p_success is null then raise exception 'invalid_publication_result' using errcode='22023'; end if;
  select * into pending from public.gateway_workspace_publications p
    where p.workspace_id = p_workspace_id and p.lease_id = p_lease_id for update;
  if not found then return 'lost'; end if;
  if pending.revision = p_revision and p_success then
    delete from public.gateway_workspace_publications where workspace_id = p_workspace_id;
    return 'completed';
  end if;
  update public.gateway_workspace_publications set lease_id = null, lease_until = null,
    available_at = case when pending.revision <> p_revision then clock_timestamp()
      else clock_timestamp() + make_interval(secs => least(3600, 30 * (2 ^ least(pending.attempts, 7)))::integer) end
    where workspace_id = p_workspace_id;
  if pending.revision <> p_revision then return 'superseded'; end if;
  return case when pending.attempts >= 10 then 'exhausted' else 'retry' end;
end;
$function$;
revoke all on function public.gateway_finish_workspace_publication(uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.gateway_finish_workspace_publication(uuid,uuid,uuid,boolean) to service_role;

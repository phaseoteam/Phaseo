-- Reset gateway request history and partitions.
-- Intended for a clean restart after historical test data polluted the request log.
-- Also hardens the table so every persisted gateway request must have a non-empty model_id.

truncate table public.gateway_requests;
do $$
declare
  v_partition record;
begin
  for v_partition in
    select child.relname as partition_name
    from pg_inherits inh
    join pg_class parent on parent.oid = inh.inhparent
    join pg_class child on child.oid = inh.inhrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    join pg_namespace child_ns on child_ns.oid = child.relnamespace
    where parent_ns.nspname = 'public'
      and child_ns.nspname = 'public'
      and parent.relname = 'gateway_requests'
  loop
    execute format('drop table if exists public.%I', v_partition.partition_name);
  end loop;
end $$;
alter table public.gateway_requests
  drop constraint if exists gateway_requests_model_id_present_ck;
alter table public.gateway_requests
  add constraint gateway_requests_model_id_present_ck
  check (nullif(btrim(model_id), '') is not null);
select public.ensure_gateway_requests_partitions(1);
create table if not exists public.gateway_requests_default
  partition of public.gateway_requests default;

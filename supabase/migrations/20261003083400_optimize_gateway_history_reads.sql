-- Key-limit reads also filter by workspace. Include that predicate in the
-- search key so successful request counts and spend can use index-only scans.
-- Keep the existing indexes until production plans confirm this replacement.
-- On a busy database, prebuild matching indexes CONCURRENTLY on each leaf
-- partition first. CREATE INDEX below reuses and attaches matching child
-- indexes without rescanning their tables. See operations/gateway-key-usage-index.md.
set local lock_timeout = '500ms';
set local statement_timeout = '15s';

-- Fail before CREATE INDEX can build a missing leaf under a write lock.
do $$
declare missing_leaves text[];
begin
  select array_agg(p.relid::regclass::text) into missing_leaves
  from pg_partition_tree('public.gateway_requests') p
  where p.isleaf and not exists (
    select 1 from pg_index i
    join pg_class index_relation on index_relation.oid=i.indexrelid
    join pg_am am on am.oid=index_relation.relam
    where i.indrelid=p.relid and i.indisvalid and i.indisready
      and not i.indisunique and am.amname='btree'
      and i.indnkeyatts=3 and i.indnatts=4 and i.indoption::text='0 0 0'
      and pg_get_expr(i.indpred,i.indrelid)='((success IS TRUE) AND (key_id IS NOT NULL))'
      and array(select a.attname::text from unnest(i.indkey) with ordinality k(attnum,position)
        join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum order by k.position)
        = array['key_id','workspace_id','created_at','cost_nanos']
      and array(select o.opcname::text from unnest(i.indclass) with ordinality k(opclass,position)
        join pg_opclass o on o.oid=k.opclass order by k.position)
        = array['uuid_ops','uuid_ops','timestamptz_ops']
  );
  if missing_leaves is not null then
    raise exception 'Missing valid prebuilt key-usage indexes on: %. Build all leaves concurrently first.',array_to_string(missing_leaves,', ');
  end if;
end;
$$;

create index gateway_requests_success_key_workspace_cost_idx
  on public.gateway_requests (key_id, workspace_id, created_at)
  include (cost_nanos)
  where success is true and key_id is not null;

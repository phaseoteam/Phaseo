-- Restored from Phaseo Prod migration records; already applied as version 20261008104643.
-- phaseo:allow-production-history-backfill reason: Record the migration already applied to production from a local checkout so db push history matches.
-- phaseo:allow-destructive-migration reason: remove a covered nonunique index; preserve usage rows and uniqueness
set local lock_timeout = '500ms';
set local statement_timeout = '15s';
do $coverage$
begin
  if not exists (
    select 1 from pg_index redundant
    join pg_index covering on covering.indrelid = redundant.indrelid
    join pg_class old_index on old_index.oid = redundant.indexrelid
    join pg_class kept_index on kept_index.oid = covering.indexrelid
    where redundant.indexrelid = to_regclass('public.v2_request_usage_request_idx')
      and covering.indexrelid = to_regclass('public.v2_request_usage_public_ranking_idx')
      and covering.indisvalid and covering.indisready
      and not redundant.indisunique and redundant.indnkeyatts = 2
      and covering.indnkeyatts = 2
      and redundant.indkey[0] = covering.indkey[0]
      and redundant.indkey[1] = covering.indkey[1]
      and redundant.indclass = covering.indclass
      and redundant.indcollation = covering.indcollation
      and redundant.indoption = covering.indoption
      and redundant.indpred is null and covering.indpred is null
      and redundant.indexprs is null and covering.indexprs is null
      and old_index.relam = kept_index.relam
  ) then
    raise exception 'Expected valid covering usage index is missing or differs';
  end if;
end;
$coverage$;
drop index public.v2_request_usage_request_idx;


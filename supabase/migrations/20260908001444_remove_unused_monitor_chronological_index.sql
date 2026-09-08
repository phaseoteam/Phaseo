-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.

-- The current history RPCs group/order by commit, while sync deletes by
-- commit_sha. Twelve representative plans are unchanged when this index
-- is hidden; keep the primary key and commit/model/provider/kind indexes.
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DROP INDEX public.monitor_history_events_committed_at_idx;

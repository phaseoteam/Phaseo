-- Key-limit reads also filter by workspace. Include that predicate in the
-- search key so successful request counts and spend can use index-only scans.
-- Keep the existing indexes until production plans confirm this replacement.
-- On a busy database, prebuild matching indexes CONCURRENTLY on each leaf
-- partition first. CREATE INDEX below reuses and attaches matching child
-- indexes without rescanning their tables. See operations/gateway-key-usage-index.md.
set local lock_timeout = '500ms';
set local statement_timeout = '15s';

create index gateway_requests_success_key_workspace_cost_idx
  on public.gateway_requests (key_id, workspace_id, created_at)
  include (cost_nanos)
  where success is true and key_id is not null;

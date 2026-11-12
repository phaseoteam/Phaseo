-- Vacuum the routing explanation tables on a fixed dead-row count instead of
-- 20% of the table. The routing archive deletes these rows after copying them
-- to R2, so dead rows arrive in bursts. The default scale factor let a 1.6M-row
-- table wait for ~300k dead rows before vacuuming, so the space freed by
-- deletes was not reused by new rows in time.
-- This does not shrink a file after a bulk drain. Only VACUUM FULL or pg_repack
-- does that, and neither belongs in a migration.
ALTER TABLE public.v2_request_routing_decisions SET (
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 1000,
  autovacuum_analyze_scale_factor = 0,
  autovacuum_analyze_threshold = 1000
);

ALTER TABLE public.v2_request_routing_traces SET (
  autovacuum_vacuum_scale_factor = 0,
  autovacuum_vacuum_threshold = 500,
  autovacuum_analyze_scale_factor = 0,
  autovacuum_analyze_threshold = 500
);

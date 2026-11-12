-- phaseo:allow-destructive-migration reason: public.gateway_request_details is already absent in production (dropped outside the migration files; the 2026-10-04 baseline export has no such table), the gateway no longer writes to it and nothing reads it, so this drop makes fresh databases and the declarative schema match production. In production it is a no-op.
-- Request and response content lives only in the I/O log in R2, indexed by
-- gateway_io_logs. No view, function or foreign key refers to this table; its
-- indexes, policies, constraints and grants go with it.

drop table if exists public.gateway_request_details;

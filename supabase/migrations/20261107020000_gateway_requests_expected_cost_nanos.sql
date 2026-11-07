SET LOCAL lock_timeout = '10s';

-- The expected cost of a delivered request whose wallet charge did not go through (pending
-- reconciliation), which budgets count until it is collected; written by the request audit.
-- Adding a nullable column without a default changes only the catalog; the check is added NOT VALID
-- here (a brief ACCESS EXCLUSIVE lock, no scan) and validated by the next migration, which scans
-- the partitions without blocking reads or writes.
ALTER TABLE public.gateway_requests ADD COLUMN IF NOT EXISTS expected_cost_nanos bigint;

DO $add_check$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.gateway_requests'::regclass and conname = 'gateway_requests_expected_cost_nanos_check'
  ) then
    ALTER TABLE public.gateway_requests
      ADD CONSTRAINT gateway_requests_expected_cost_nanos_check CHECK ((expected_cost_nanos >= 0)) NOT VALID;
  end if;
end
$add_check$;

-- Clients read every request column except detail_metadata (RLS limits the rows).
GRANT SELECT ("expected_cost_nanos") ON TABLE "public"."gateway_requests" TO "anon";

GRANT SELECT ("expected_cost_nanos") ON TABLE "public"."gateway_requests" TO "authenticated";

COMMENT ON COLUMN "public"."gateway_requests"."expected_cost_nanos" IS 'Expected cost of a delivered request whose wallet charge did not go through (pending reconciliation); NULL otherwise. cost_nanos is what the wallet took. Budgets count greatest(cost_nanos, expected_cost_nanos).';

SET LOCAL lock_timeout = '10s';

-- Validates the check added NOT VALID by the previous migration (SHARE UPDATE EXCLUSIVE: reads and
-- writes continue while the partitions are scanned).
ALTER TABLE public.gateway_requests VALIDATE CONSTRAINT gateway_requests_expected_cost_nanos_check;

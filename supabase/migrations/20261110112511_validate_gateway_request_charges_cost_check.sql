SET LOCAL lock_timeout = '10s';

-- Validate the relaxed cost_nanos >= 0 check added NOT VALID by
-- 20261110112509_gateway_request_charges_stepped_columns. In its own migration (its own
-- transaction), validation holds only SHARE UPDATE EXCLUSIVE, so charge writes
-- continue while existing rows are checked.
alter table public.gateway_request_charges
  validate constraint gateway_request_charges_cost_nanos_check;

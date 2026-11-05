-- Validate the relaxed cost_nanos >= 0 check added NOT VALID by
-- 20261104231117_gateway_charge_request_total. In its own migration (its own
-- transaction), validation holds only SHARE UPDATE EXCLUSIVE, so charge writes
-- continue while existing rows are checked.
alter table public.gateway_request_charges
  validate constraint gateway_request_charges_cost_nanos_check;

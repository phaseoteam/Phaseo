-- Validate the replacement checks in a later transaction, after the migration
-- that swaps them has committed and released its ACCESS EXCLUSIVE lock.

alter table public.v2_request_facts
  validate constraint v2_request_facts_service_tier_requested_check;
alter table public.v2_request_facts
  validate constraint v2_request_facts_service_tier_observed_check;
alter table public.v2_request_facts
  validate constraint v2_request_facts_service_tier_slug_check;

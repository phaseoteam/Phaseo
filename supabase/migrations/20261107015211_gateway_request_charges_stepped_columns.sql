SET LOCAL lock_timeout = '10s';

-- The gateway_request_charges columns gateway_charge_request_total (next migration) uses. Table
-- changes only: this transaction locks gateway_request_charges and nothing else.
-- is_final: false while the total can still change; existing one-off charges
-- are final. cost_nanos may now be 0, for a final bill that was waived.

alter table public.gateway_request_charges
  add column if not exists is_final boolean not null default true;

-- The key every charge (one-off or stepped) was made under, so key and
-- department budgets can count it before, or without, its gateway_requests
-- row. Null for OAuth access tokens and for rows written before this column.
alter table public.gateway_request_charges
  add column if not exists key_id uuid;

-- Relax cost_nanos > 0 to >= 0. The new check is added unvalidated so this
-- migration's ACCESS EXCLUSIVE lock is brief; it is validated by
-- 20261107015213_validate_gateway_request_charges_cost_check, a separate
-- transaction under SHARE UPDATE EXCLUSIVE (writes continue).
alter table public.gateway_request_charges
  drop constraint if exists gateway_request_charges_cost_nanos_check;
alter table public.gateway_request_charges
  add constraint gateway_request_charges_cost_nanos_check check ((cost_nanos >= 0)) not valid;

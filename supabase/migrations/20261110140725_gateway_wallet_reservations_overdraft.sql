SET LOCAL lock_timeout = '10s';

-- The uncovered part of a batch or video settlement that went into overdraft, recorded by
-- gateway_wallet_settle_once (next migration). Table changes only: this transaction locks
-- gateway_wallet_reservations and nothing else.
alter table public.gateway_wallet_reservations
  add column if not exists overdraft_nanos bigint not null default 0;

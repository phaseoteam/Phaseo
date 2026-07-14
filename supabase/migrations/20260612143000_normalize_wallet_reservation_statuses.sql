-- The API compatibility layer treats active reservation holds as "held" while the
-- null-safe RPC migration stores them as "reserved". Normalize any lingering
-- pre-migration rows so capture/release continue to work uniformly.

update public.gateway_wallet_reservations
set status = 'reserved',
    updated_at = now()
where status = 'held';

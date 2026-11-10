SET LOCAL lock_timeout = '10s';
-- phaseo:allow-destructive-migration reason: TRUNCATE appears only in a REVOKE that removes it from anon and authenticated on gateway_wallet_reservations; no table or row is removed.

-- Clients cannot write wallet reservations: the gateway holds, settles and releases them through
-- SECURITY DEFINER functions. Locks only gateway_wallet_reservations.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.gateway_wallet_reservations FROM anon, authenticated;

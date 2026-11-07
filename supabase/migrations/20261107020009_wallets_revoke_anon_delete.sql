SET LOCAL lock_timeout = '10s';

-- Anonymous clients cannot delete wallets. Locks only wallets.
REVOKE DELETE ON TABLE public.wallets FROM anon;

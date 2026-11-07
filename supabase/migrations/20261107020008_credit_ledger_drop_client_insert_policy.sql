SET LOCAL lock_timeout = '10s';

-- Clients never write the credit ledger: the gateway and Stripe flows write it through
-- SECURITY DEFINER functions. Drops the INSERT policy that let authenticated users add rows.
-- Locks only credit_ledger (ACCESS EXCLUSIVE, briefly).
DROP POLICY IF EXISTS "Enable insert for users based on user_id" ON public.credit_ledger;

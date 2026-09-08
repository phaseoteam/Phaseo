-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.
-- phaseo:allow-destructive-migration reason: Restore already-applied history: financial table write privileges are revoked; TRUNCATE is not executed.

-- Restoring the owner helper must not allow owners to write financial balances.
-- RLS scopes the workspace; backend-only column privileges protect the money.
revoke insert, update, truncate on public.wallets from public, anon, authenticated;
revoke insert (balance_nanos, reserved_nanos, stripe_customer_id, auto_top_up_account_id),
  update (balance_nanos, reserved_nanos, stripe_customer_id, auto_top_up_account_id)
  on public.wallets from public, anon, authenticated;
grant insert (workspace_id, auto_top_up_enabled, low_balance_threshold, auto_top_up_amount, updated_at)
  on public.wallets to authenticated;
grant update (auto_top_up_enabled, low_balance_threshold, auto_top_up_amount, updated_at)
  on public.wallets to authenticated;

-- Ledger rows are emitted by trusted settlement code and privileged redemption.
revoke insert, update, delete, truncate on public.credit_ledger from public, anon, authenticated;
notify pgrst, 'reload schema';

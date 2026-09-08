-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- Original version and SQL are retained; this migration is already applied in production.
-- phaseo:allow-destructive-migration reason: Restore already-applied history: TRUNCATE is revoked from workspaces, not executed.

-- RLS determines which workspace a caller can edit; column privileges determine
-- which fields they may change. Ownership and billing authority are backend-owned.
revoke insert, update, truncate on public.workspaces from public, anon, authenticated;
revoke insert (tier, billing_mode, workspace_kind),
  update (owner_user_id, tier, billing_mode, workspace_kind)
  on public.workspaces from public, anon, authenticated;
grant insert (id, name, slug, owner_user_id, created_at, updated_at, publisher_handle, logo_url)
  on public.workspaces to authenticated;
grant update (name, slug, updated_at, publisher_handle, logo_url)
  on public.workspaces to authenticated;
notify pgrst, 'reload schema';

-- Recovered from the production supabase_migrations.schema_migrations ledger.
-- phaseo:allow-production-history-backfill reason: Version 20260907233146 is already applied in production; restore its recorded SQL without replaying it.
-- Original version and SQL are retained; this migration is already applied in production.
-- phaseo:allow-destructive-migration reason: Restore already-applied history: TRUNCATE is revoked from users, not executed.

-- Self-service profile writes must not assign the platform administrator role.
-- The existing UPDATE trigger does not cover INSERT (including re-insertion).
revoke insert, update on table public.users from public, anon, authenticated;
revoke truncate on table public.users from public, anon, authenticated;
revoke insert (role), update (role) on table public.users from public, anon, authenticated;

grant insert (
  user_id, display_name, default_workspace_id, obfuscate_info, created_at,
  updated_at, beta_opt_in, beta_features, public_profile_enabled,
  public_profile_slug, onboarding_state, onboarding_completed_at,
  declared_country_code, country_declared_at
) on public.users to authenticated;
grant update (
  display_name, default_workspace_id, obfuscate_info, updated_at,
  beta_opt_in, beta_features, public_profile_enabled, public_profile_slug,
  onboarding_state, onboarding_completed_at, declared_country_code,
  country_declared_at
) on public.users to authenticated;

-- Backend role management keeps its existing table privileges.
notify pgrst, 'reload schema';

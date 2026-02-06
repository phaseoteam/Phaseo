-- Recovery codes have been removed from the MFA flow in development.
drop table if exists public.user_recovery_codes cascade;

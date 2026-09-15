-- Privacy and route restrictions are workspace-scoped. The former account-level
-- policy was a legacy Chat-only overlay and is intentionally not migrated into
-- every workspace because that would change each workspace's explicit policy.
drop table if exists public.account_guardrail_settings;

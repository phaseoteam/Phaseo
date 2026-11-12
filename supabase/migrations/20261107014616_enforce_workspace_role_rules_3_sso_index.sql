SET LOCAL lock_timeout = '10s';

-- Workspace role rules, part 3 of 3: an enabled single sign-on provider can belong to one workspace only.
-- Disabled configurations don't reserve the provider. CREATE INDEX takes a SHARE lock on
-- workspace_settings (reads continue; writes wait) for the build, which is brief: the table has one row
-- per workspace and the index covers only enabled SSO rows (none in production). Production has no SSO
-- provider identifiers set; if enabled duplicates exist at deploy, this fails rather than leaving
-- uniqueness unenforced.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_settings_sso_provider_identifier_key ON public.workspace_settings USING btree (sso_provider_identifier)
  WHERE (sso_enabled AND (sso_provider_identifier IS NOT NULL));

-- Let the first-party CLI OAuth client request the BYOK, private model and feedback scopes.
-- provider_credentials:* and private_models:* are already in the CLI's default login scopes
-- (DEFAULT_CLI_OAUTH_CAPABILITIES), but the phaseo_cli allowlist never gained them, so login
-- dropped them and `phaseo byok` / `phaseo private-models` returned 403. feedback:read and
-- feedback:write stay opt-in (`phaseo login --scopes ...`) but must be allowed to be granted.
-- Idempotent: existing scopes are kept, duplicates removed, the result sorted. Only phaseo_cli changes.

UPDATE public.oauth_clients
SET allowed_scopes = array(
  SELECT DISTINCT scope
  FROM unnest(coalesce(allowed_scopes, '{}'::text[]) || array[
    'provider_credentials:read', 'provider_credentials:write', 'provider_credentials:delete',
    'private_models:read', 'private_models:write', 'private_models:delete',
    'feedback:read', 'feedback:write'
  ]) scope
  ORDER BY scope
), updated_at = now()
WHERE id = 'phaseo_cli';

-- 0000_platform.sql: platform layer for Phaseo on PlanetScale Postgres 17.
--
-- Recreates the parts of a Supabase project that the application schema
-- (0002_baseline.sql) relies on but does not define itself:
--   * schemas: extensions, auth, private, catalogue_private
--   * extensions in the same schemas as on Supabase, so qualified references
--     such as extensions.moddatetime() and extensions.gin_trgm_ops keep working
--   * NOLOGIN roles anon, authenticated and service_role, used by RLS policies
--     and grants, and by the compat client through SET LOCAL ROLE
--   * auth.uid(), auth.role() and auth.jwt(), defined as Supabase defines them
--     (they read the request.jwt.claims setting that PostgREST sets)
--
-- Run it on the direct connection (port 5432), before 0001_auth.sql. Every
-- statement is idempotent, so it can be re-run.
-- Not here: pg_net and index_advisor (PlanetScale does not offer them; see
-- SCHEMA-PORT.md) and pg_cron (0003_cron.sql, once it is enabled in the dashboard).

-- ---------------------------------------------------------------------------
-- Schemas

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS catalogue_private;

COMMENT ON SCHEMA extensions IS 'Extensions, kept in their Supabase schema so qualified references keep resolving.';
COMMENT ON SCHEMA auth IS 'Better Auth tables (0001_auth.sql) and the Supabase-compatible auth.uid()/role()/jwt() functions.';

-- ---------------------------------------------------------------------------
-- Extensions

CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- If one of them was preinstalled elsewhere (for example in public), move it.
DO $move_extensions$
DECLARE
  ext record;
BEGIN
  FOR ext IN
    SELECT e.extname
    FROM pg_catalog.pg_extension e
    JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname IN ('moddatetime', 'pg_trgm', 'pgcrypto', 'uuid-ossp')
      AND n.nspname <> 'extensions'
  LOOP
    EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', ext.extname);
  END LOOP;
END
$move_extensions$;

-- Diagnostics extensions are optional: nothing in the schema depends on them,
-- and PlanetScale only offers them after they are enabled in the dashboard.
DO $optional_extensions$
DECLARE
  ext text;
BEGIN
  FOREACH ext IN ARRAY ARRAY['hypopg', 'pg_stat_statements'] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = ext) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_available_extensions WHERE name = ext) THEN
      RAISE WARNING 'optional extension % is not available here; enable it in the PlanetScale dashboard and re-run this file', ext;
      CONTINUE;
    END IF;
    BEGIN
      EXECUTE format('CREATE EXTENSION IF NOT EXISTS %I WITH SCHEMA extensions', ext);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'optional extension % not created: %', ext, SQLERRM;
    END;
  END LOOP;
END
$optional_extensions$;

-- ---------------------------------------------------------------------------
-- Roles
--
-- Same shape as Supabase: NOLOGIN NOINHERIT, and service_role bypasses RLS.
-- Creating a BYPASSRLS role needs BYPASSRLS (or superuser). If the migration
-- role lacks it, service_role is created without it and a warning is raised;
-- see SCHEMA-PORT.md, "Open decisions".

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    BEGIN
      CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      CREATE ROLE service_role NOLOGIN NOINHERIT;
      RAISE WARNING 'service_role created without BYPASSRLS (%); RLS policies now apply to it', SQLERRM;
    END;
  ELSIF NOT (SELECT rolbypassrls FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    BEGIN
      ALTER ROLE service_role BYPASSRLS;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'service_role exists without BYPASSRLS and it could not be added: %', SQLERRM;
    END;
  END IF;
END
$roles$;

-- The application login role must be able to SET ROLE into these. Run this
-- once per login role (it is not run here because the role name is chosen in
-- the PlanetScale dashboard):
--   GRANT anon, authenticated, service_role TO <app_login_role> WITH INHERIT FALSE, SET TRUE;

GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Supabase-compatible request context functions
--
-- Identical to Supabase's definitions. The compat client sets the claims per
-- transaction: set_config('request.jwt.claims', '{"sub": "...", "role": "authenticated"}', true).
-- The legacy per-claim settings (request.jwt.claim.sub, request.jwt.claim.role)
-- are still honoured first, as on Supabase.

CREATE OR REPLACE FUNCTION auth.uid()
  RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role()
  RETURNS text
  LANGUAGE sql
  STABLE
AS $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.jwt()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
AS $$
  select
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$$;

COMMENT ON FUNCTION auth.uid() IS 'Deprecated. Use auth.jwt() -> ''sub'' instead.';
COMMENT ON FUNCTION auth.role() IS 'Deprecated. Use auth.jwt() -> ''role'' instead.';
COMMENT ON FUNCTION auth.jwt() IS 'Request JWT claims, from the request.jwt.claims setting (Supabase-compatible).';

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role;

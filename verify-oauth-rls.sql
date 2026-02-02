-- Verify OAuth RLS Policies are Enabled
-- Run this in Supabase SQL Editor to check if policies were created

-- Check if RLS is enabled on tables
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('oauth_app_metadata', 'oauth_authorizations')
ORDER BY tablename;

-- Check what RLS policies exist
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd AS operation,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('oauth_app_metadata', 'oauth_authorizations')
ORDER BY tablename, policyname;

-- Expected results:
-- oauth_app_metadata: 4 policies (select, insert, update, delete)
-- oauth_authorizations: 4 policies (2x select, update, delete)

-- Refuses writes from OAuth client tokens (a client_id claim) on users; see 20261106230930_refuse_oauth_client_writes.sql.
-- One table per migration, so this transaction locks only this table and can't deadlock with readers that lock
-- several tables; if the lock isn't granted within 10 seconds the migration fails instead of queueing readers.
SET LOCAL lock_timeout = '10s';

CREATE POLICY "users_no_oauth_client_insert" ON "public"."users"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "users_no_oauth_client_update" ON "public"."users"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "users_no_oauth_client_delete" ON "public"."users"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

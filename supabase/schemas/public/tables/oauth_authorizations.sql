CREATE TABLE "public"."oauth_authorizations" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "client_id"    text                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "scopes"       text[]                   NOT NULL DEFAULT '{}'::text[],
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "last_used_at" timestamp with time zone,
  "revoked_at"   timestamp with time zone,
  CONSTRAINT "oauth_authorizations_pkey" PRIMARY KEY (id),
  CONSTRAINT "oauth_authorizations_user_client_workspace_unique" UNIQUE (user_id, client_id, workspace_id),
  CONSTRAINT "oauth_authorizations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "oauth_authorizations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."oauth_authorizations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX oauth_authorizations_client_id_idx ON public.oauth_authorizations USING btree (client_id)
  WHERE (revoked_at IS NULL);

CREATE INDEX oauth_authorizations_last_used_idx ON public.oauth_authorizations USING btree (last_used_at DESC)
  WHERE (revoked_at IS NULL);

CREATE INDEX oauth_authorizations_validation_idx ON public.oauth_authorizations USING btree (user_id, client_id, workspace_id)
  WHERE (revoked_at IS NULL);

CREATE INDEX oauth_authorizations_workspace_id_idx ON public.oauth_authorizations USING btree (workspace_id)
  WHERE (revoked_at IS NULL);

CREATE POLICY "oauth_authorizations_delete_own" ON "public"."oauth_authorizations"
  FOR DELETE
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "oauth_authorizations_select_authorized" ON "public"."oauth_authorizations"
  FOR SELECT
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.oauth_app_metadata metadata
  WHERE ((metadata.client_id = oauth_authorizations.client_id) AND public.is_workspace_member(metadata.workspace_id))))));

CREATE POLICY "oauth_authorizations_update_own" ON "public"."oauth_authorizations"
  FOR UPDATE
  TO "authenticated"
  USING (((user_id = ( SELECT auth.uid() AS uid)) AND (revoked_at IS NULL)))
  WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) AND (revoked_at IS NOT NULL)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."oauth_authorizations" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."oauth_authorizations" TO "service_role";

COMMENT ON TABLE "public"."oauth_authorizations" IS 'User authorizations to OAuth applications. Tracks consent, usage, and revocation.';

REVOKE ALL ON TABLE "public"."oauth_authorizations" FROM "authenticated";

REVOKE ALL ("revoked_at") ON TABLE "public"."oauth_authorizations" FROM "authenticated";

GRANT UPDATE ("revoked_at") ON TABLE "public"."oauth_authorizations" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."oauth_authorizations" TO "authenticated";

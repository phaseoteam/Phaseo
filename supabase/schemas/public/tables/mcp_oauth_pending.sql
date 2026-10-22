CREATE TABLE "public"."mcp_oauth_pending" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "state_hash"        text                     NOT NULL,
  "workspace_id"      uuid                     NOT NULL,
  "user_id"           uuid                     NOT NULL,
  "oauth_client_id"   uuid                     NOT NULL,
  "server_url"        text                     NOT NULL,
  "resource"          text                     NOT NULL,
  "issuer"            text                     NOT NULL,
  "label_slug"        text                     NOT NULL,
  "display_name"      text                     NOT NULL,
  "scopes"            text[]                   NOT NULL DEFAULT '{}'::text[],
  "code_verifier_enc" text                     NOT NULL,
  "redirect_after"    text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"        timestamp with time zone NOT NULL DEFAULT (now() + '00:10:00'::interval),
  CONSTRAINT "mcp_oauth_pending_oauth_client_id_fkey" FOREIGN KEY (oauth_client_id) REFERENCES public.mcp_oauth_clients(id) ON DELETE CASCADE,
  CONSTRAINT "mcp_oauth_pending_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_oauth_pending_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "mcp_oauth_pending_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."mcp_oauth_pending"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX mcp_oauth_pending_expires_at_idx ON public.mcp_oauth_pending USING btree (expires_at);

CREATE INDEX mcp_oauth_pending_oauth_client_id_idx ON public.mcp_oauth_pending USING btree (oauth_client_id);

CREATE UNIQUE INDEX mcp_oauth_pending_state_hash_idx ON public.mcp_oauth_pending USING btree (state_hash);

CREATE INDEX mcp_oauth_pending_user_idx ON public.mcp_oauth_pending USING btree (user_id);

CREATE INDEX mcp_oauth_pending_workspace_idx ON public.mcp_oauth_pending USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."mcp_oauth_pending"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."mcp_oauth_pending" IS 'MCP connection sign-ins in progress. The OAuth callback uses each row once, and rows expire after ten minutes.';

REVOKE ALL ON TABLE "public"."mcp_oauth_pending" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mcp_oauth_pending" TO "service_role";

REVOKE ALL ON TABLE "public"."mcp_oauth_pending" FROM "anon", "authenticated";

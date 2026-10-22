CREATE TABLE "public"."mcp_connections" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "user_id"           uuid                     NOT NULL,
  "label_slug"        text                     NOT NULL,
  "display_name"      text                     NOT NULL,
  "server_url"        text                     NOT NULL,
  "auth_kind"         text                     NOT NULL DEFAULT 'oauth'::text,
  "resource"          text,
  "issuer"            text,
  "oauth_client_id"   uuid,
  "scopes"            text[]                   NOT NULL DEFAULT '{}'::text[],
  "status"            text                     NOT NULL DEFAULT 'active'::text,
  "access_token_enc"  text,
  "refresh_token_enc" text,
  "access_expires_at" timestamp with time zone,
  "tools_hash"        text,
  "tools_changed_at"  timestamp with time zone,
  "tools_reviewed_at" timestamp with time zone,
  "disabled_tools"    text[]                   NOT NULL DEFAULT '{}'::text[],
  "last_used_at"      timestamp with time zone,
  "last_error"        text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mcp_connections_auth_kind_check" CHECK ((auth_kind = ANY (ARRAY['oauth'::text, 'none'::text]))),
  CONSTRAINT "mcp_connections_display_name_check" CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 100))),
  CONSTRAINT "mcp_connections_label_slug_check" CHECK ((label_slug ~ '^[a-z][a-z0-9_]{0,23}$'::text)),
  CONSTRAINT "mcp_connections_oauth_client_id_fkey" FOREIGN KEY (oauth_client_id) REFERENCES public.mcp_oauth_clients(id) ON DELETE SET NULL,
  CONSTRAINT "mcp_connections_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_connections_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'needs_reauth'::text, 'revoked'::text]))),
  CONSTRAINT "mcp_connections_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "mcp_connections_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."mcp_connections"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX mcp_connections_oauth_client_id_idx ON public.mcp_connections USING btree (oauth_client_id);

CREATE UNIQUE INDEX mcp_connections_owner_label_idx ON public.mcp_connections USING btree (workspace_id, user_id, label_slug);

CREATE INDEX mcp_connections_user_idx ON public.mcp_connections USING btree (user_id, workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."mcp_connections"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."mcp_connections" IS 'MCP servers a person connected for their own use in a workspace. Tokens are encrypted and only trusted server runtimes decrypt them; calls always run as the person who connected.';

REVOKE ALL ON TABLE "public"."mcp_connections" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mcp_connections" TO "service_role";

REVOKE ALL ON TABLE "public"."mcp_connections" FROM "anon", "authenticated";

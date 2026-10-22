CREATE TABLE "public"."mcp_oauth_clients" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "issuer"            text                     NOT NULL,
  "registration_kind" text                     NOT NULL,
  "redirect_uri"      text                     NOT NULL,
  "client_id"         text                     NOT NULL,
  "client_secret_enc" text,
  "metadata"          jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mcp_oauth_clients_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_oauth_clients_registration_kind_check" CHECK ((registration_kind = ANY (ARRAY['cimd'::text, 'dcr'::text])))
);

ALTER TABLE "public"."mcp_oauth_clients"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX mcp_oauth_clients_issuer_kind_redirect_idx ON public.mcp_oauth_clients USING btree (issuer, registration_kind, redirect_uri);

CREATE POLICY "deny_direct_client_access" ON "public"."mcp_oauth_clients"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."mcp_oauth_clients" IS 'OAuth client registrations Phaseo holds with upstream MCP authorization servers, shared by every connection to that issuer. Client secrets are encrypted.';

REVOKE ALL ON TABLE "public"."mcp_oauth_clients" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mcp_oauth_clients" TO "service_role";

REVOKE ALL ON TABLE "public"."mcp_oauth_clients" FROM "anon", "authenticated";

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

CREATE TABLE "public"."mcp_tool_calls" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "user_id"           uuid,
  "connection_id"     uuid,
  "surface"           text                     NOT NULL DEFAULT 'mcp'::text,
  "tool_name"         text                     NOT NULL,
  "status"            text                     NOT NULL,
  "error_code"        text,
  "latency_ms"        integer,
  "request_bytes"     integer,
  "response_bytes"    integer,
  "injection_flagged" boolean                  NOT NULL DEFAULT false,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mcp_tool_calls_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES public.mcp_connections(id) ON DELETE SET NULL,
  CONSTRAINT "mcp_tool_calls_pkey" PRIMARY KEY (id),
  CONSTRAINT "mcp_tool_calls_status_check" CHECK ((status = ANY (ARRAY['ok'::text, 'error'::text, 'blocked'::text]))),
  CONSTRAINT "mcp_tool_calls_surface_check" CHECK ((surface = ANY (ARRAY['mcp'::text, 'slack'::text, 'gateway'::text]))),
  CONSTRAINT "mcp_tool_calls_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "mcp_tool_calls_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."mcp_tool_calls"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX mcp_tool_calls_connection_created_idx ON public.mcp_tool_calls USING btree (connection_id, created_at DESC);

CREATE INDEX mcp_tool_calls_user_idx ON public.mcp_tool_calls USING btree (user_id);

CREATE INDEX mcp_tool_calls_workspace_created_idx ON public.mcp_tool_calls USING btree (workspace_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."mcp_tool_calls"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."mcp_tool_calls" IS 'One row per tool call made through a connected MCP server. Holds timing, sizes and outcome only, never arguments or results.';

REVOKE ALL ON TABLE "public"."mcp_tool_calls" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."mcp_tool_calls" TO "service_role";

REVOKE ALL ON TABLE "public"."mcp_tool_calls" FROM "anon", "authenticated";

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

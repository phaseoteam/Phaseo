CREATE TABLE "public"."workspace_publisher_handle_aliases" (
  "handle"       text                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_publisher_handle_alias_format" CHECK ((handle ~ '^[a-z0-9][a-z0-9_-]{2,39}$'::text)),
  CONSTRAINT "workspace_publisher_handle_aliases_pkey" PRIMARY KEY (handle),
  CONSTRAINT "workspace_publisher_handle_aliases_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_publisher_handle_aliases"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_publisher_handle_aliases_workspace_idx ON public.workspace_publisher_handle_aliases USING btree (workspace_id, created_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."workspace_publisher_handle_aliases"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."workspace_publisher_handle_aliases" TO "service_role";

COMMENT ON TABLE "public"."workspace_publisher_handle_aliases" IS 'Permanent historical workspace publisher handles used for redirects and preset resolution.';

REVOKE ALL ON TABLE "public"."workspace_publisher_handle_aliases" FROM "anon", "authenticated";

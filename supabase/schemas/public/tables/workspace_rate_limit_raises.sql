CREATE TABLE "public"."workspace_rate_limit_raises" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "from_tier"      text                     NOT NULL,
  "to_tier"        text                     NOT NULL,
  "requested_by"   uuid,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"     timestamp with time zone NOT NULL,
  "revoked_at"     timestamp with time zone,
  "revoked_reason" text,
  CONSTRAINT "workspace_rate_limit_raises_expiry_check" CHECK ((expires_at > created_at)),
  CONSTRAINT "workspace_rate_limit_raises_from_tier_check" CHECK ((from_tier = ANY (ARRAY['new'::text, 'standard'::text]))),
  CONSTRAINT "workspace_rate_limit_raises_pkey" PRIMARY KEY (id),
  CONSTRAINT "workspace_rate_limit_raises_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "workspace_rate_limit_raises_to_tier_check" CHECK ((to_tier = ANY (ARRAY['standard'::text, 'trusted'::text]))),
  CONSTRAINT "workspace_rate_limit_raises_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_rate_limit_raises"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX workspace_rate_limit_raises_requested_by_idx ON public.workspace_rate_limit_raises USING btree (requested_by);

CREATE INDEX workspace_rate_limit_raises_workspace_id_created_at_idx ON public.workspace_rate_limit_raises USING btree (workspace_id, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_rate_limit_raises"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."workspace_rate_limit_raises" IS 'Self-serve customer rate limit raises: a workspace owner moves the workspace one trust-ladder tier up for a limited time. A raise stops applying when it expires, when revoked_at is set (operators revoke by setting it as service_role), or when a Stripe refund succeeds after it was requested. Operator overrides in workspace_rate_limit_overrides still win.';

REVOKE ALL ON TABLE "public"."workspace_rate_limit_raises" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."workspace_rate_limit_raises" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_rate_limit_raises" FROM "anon", "authenticated";

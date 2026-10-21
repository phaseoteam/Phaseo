CREATE TABLE "public"."workspace_low_balance_push_state" (
  "workspace_id"    uuid                     NOT NULL,
  "armed"           boolean                  NOT NULL,
  "balance_nanos"   bigint                   NOT NULL,
  "threshold_nanos" bigint                   NOT NULL,
  "changed_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "last_alert_at"   timestamp with time zone,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_low_balance_push_state_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "workspace_low_balance_push_state_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."workspace_low_balance_push_state"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."workspace_low_balance_push_state"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON COLUMN "public"."workspace_low_balance_push_state"."armed" IS 'True while the balance is above the threshold. The next sweep that finds it at or below the threshold counts a drop and clears it; a sweep that finds it back above sets it again.';

COMMENT ON COLUMN "public"."workspace_low_balance_push_state"."balance_nanos" IS 'Wallet balance when armed last changed, or when the workspace was first seen.';

COMMENT ON COLUMN "public"."workspace_low_balance_push_state"."changed_at" IS 'When armed last changed, or when the workspace was first seen. A sweep writes a row only when armed changes, so an idle sweep writes nothing.';

COMMENT ON COLUMN "public"."workspace_low_balance_push_state"."last_alert_at" IS 'When the last drop was pushed. A drop while auto top-up is on and working is recorded without a push and leaves this unchanged.';

COMMENT ON COLUMN "public"."workspace_low_balance_push_state"."threshold_nanos" IS 'Threshold the balance was compared with then: the workspace''s low-balance threshold, or $5 without one.';

COMMENT ON TABLE "public"."workspace_low_balance_push_state" IS 'Low-balance push state of each workspace that sweep_low_balance_pushes has watched, that is one where an owner or admin gets money pushes. A drop to or below the threshold is pushed once, and the push is armed again only once the balance is back above it. First seen at or below the threshold, a workspace starts unarmed, so one that never had credits is never told. Rows are kept while a workspace is not watched, so a drop in the meantime is pushed when it is watched again.';

REVOKE ALL ON TABLE "public"."workspace_low_balance_push_state" FROM "service_role";

GRANT SELECT ON TABLE "public"."workspace_low_balance_push_state" TO "service_role";

REVOKE ALL ON TABLE "public"."workspace_low_balance_push_state" FROM "anon", "authenticated";

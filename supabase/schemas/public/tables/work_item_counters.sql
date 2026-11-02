CREATE TABLE "public"."work_item_counters" (
  "workspace_id" uuid    NOT NULL,
  "last_number"  integer NOT NULL DEFAULT 0,
  CONSTRAINT "work_item_counters_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "work_item_counters_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_item_counters"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_item_counters"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_item_counters" IS 'The last work item number given out per workspace. Written only by public.create_work_item.';

REVOKE ALL ON TABLE "public"."work_item_counters" FROM "service_role";

GRANT SELECT ON TABLE "public"."work_item_counters" TO "service_role";

REVOKE ALL ON TABLE "public"."work_item_counters" FROM "anon", "authenticated";

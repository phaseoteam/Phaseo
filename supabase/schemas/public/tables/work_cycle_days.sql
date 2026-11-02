CREATE TABLE "public"."work_cycle_days" (
  "cycle_id"     uuid                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "day"          date                     NOT NULL,
  "scope"        numeric                  NOT NULL DEFAULT 0,
  "completed"    numeric                  NOT NULL DEFAULT 0,
  "item_count"   integer                  NOT NULL DEFAULT 0,
  "done_count"   integer                  NOT NULL DEFAULT 0,
  "recorded_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_cycle_days_cycle_id_fkey" FOREIGN KEY (cycle_id) REFERENCES public.work_cycles(id) ON DELETE CASCADE,
  CONSTRAINT "work_cycle_days_pkey" PRIMARY KEY (cycle_id, day)
);

ALTER TABLE "public"."work_cycle_days"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_cycle_days"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_cycle_days" IS 'A work cycle''s totals at the end of each UTC day it ran (the latest snapshot that day), for its burn-up chart. Written by public.snapshot_work_cycle_days.';

REVOKE ALL ON TABLE "public"."work_cycle_days" FROM "service_role";

GRANT SELECT ON TABLE "public"."work_cycle_days" TO "service_role";

REVOKE ALL ON TABLE "public"."work_cycle_days" FROM "anon", "authenticated";

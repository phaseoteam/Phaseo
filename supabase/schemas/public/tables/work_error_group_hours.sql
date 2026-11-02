CREATE TABLE "public"."work_error_group_hours" (
  "group_id"     uuid                     NOT NULL,
  "hour"         timestamp with time zone NOT NULL,
  "event_count"  integer                  NOT NULL DEFAULT 0,
  CONSTRAINT "work_error_group_hours_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.work_error_groups(id) ON DELETE CASCADE,
  CONSTRAINT "work_error_group_hours_pkey" PRIMARY KEY (group_id, hour)
);

ALTER TABLE "public"."work_error_group_hours"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_error_group_hours"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_error_group_hours" IS 'Events per error group per UTC hour, for the error chart and spike detection. Written by public.record_work_error_event; rows older than 30 days can be pruned.';

REVOKE ALL ON TABLE "public"."work_error_group_hours" FROM "service_role";

GRANT DELETE, SELECT ON TABLE "public"."work_error_group_hours" TO "service_role";

REVOKE ALL ON TABLE "public"."work_error_group_hours" FROM "anon", "authenticated";

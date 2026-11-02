CREATE TABLE "public"."work_cycles" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "number"       integer                  NOT NULL,
  "name"         text,
  "starts_on"    date                     NOT NULL,
  "ends_on"      date                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_cycles_dates_check" CHECK ((ends_on > starts_on)),
  CONSTRAINT "work_cycles_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_cycles_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE,
  CONSTRAINT "work_cycles_workspace_id_number_key" UNIQUE (workspace_id, number)
);

ALTER TABLE "public"."work_cycles"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_cycles_workspace_dates_idx ON public.work_cycles USING btree (workspace_id, starts_on DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_cycles"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_cycles" IS 'Time-boxed cycles (sprints), numbered per workspace. Work items are planned into at most one cycle.';

REVOKE ALL ON TABLE "public"."work_cycles" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_cycles" TO "service_role";

REVOKE ALL ON TABLE "public"."work_cycles" FROM "anon", "authenticated";

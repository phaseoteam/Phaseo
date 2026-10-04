CREATE TABLE "public"."v2_catalogue_backfill_issues" (
  "issue_id"    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "source_type" text                     NOT NULL,
  "source_key"  text                     NOT NULL,
  "issue_code"  text                     NOT NULL,
  "details"     jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_catalogue_backfill_issues_key" UNIQUE (source_type, source_key, issue_code),
  CONSTRAINT "v2_catalogue_backfill_issues_pkey" PRIMARY KEY (issue_id)
);

ALTER TABLE "public"."v2_catalogue_backfill_issues"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_catalogue_backfill_issues_type_idx ON public.v2_catalogue_backfill_issues USING btree (source_type, issue_code, created_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."v2_catalogue_backfill_issues"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_catalogue_backfill_issues" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_catalogue_backfill_issues" FROM "anon", "authenticated";

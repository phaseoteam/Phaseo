CREATE TABLE "public"."monitor_history_commits" (
  "commit_sha"   text                     NOT NULL,
  "committed_at" timestamp with time zone NOT NULL,
  "entry_count"  integer                  NOT NULL DEFAULT 0,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "monitor_history_commits_pkey" PRIMARY KEY (commit_sha)
);

ALTER TABLE "public"."monitor_history_commits"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX monitor_history_commits_committed_at_idx ON public.monitor_history_commits USING btree (committed_at DESC, commit_sha DESC);

CREATE POLICY "service_role_full_access" ON "public"."monitor_history_commits"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monitor_history_commits" TO "service_role";

REVOKE ALL ON TABLE "public"."monitor_history_commits" FROM "anon", "authenticated";

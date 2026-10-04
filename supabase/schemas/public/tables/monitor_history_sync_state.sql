CREATE TABLE "public"."monitor_history_sync_state" (
  "sync_key"     text                     NOT NULL,
  "source_base"  text,
  "source_head"  text,
  "last_sha"     text,
  "generated_at" timestamp with time zone,
  "commit_count" integer,
  "entry_count"  integer,
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "monitor_history_sync_state_pkey" PRIMARY KEY (sync_key)
);

ALTER TABLE "public"."monitor_history_sync_state"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON "public"."monitor_history_sync_state"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monitor_history_sync_state" TO "service_role";

REVOKE ALL ON TABLE "public"."monitor_history_sync_state" FROM "anon", "authenticated";

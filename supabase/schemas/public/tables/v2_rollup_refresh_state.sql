CREATE TABLE "public"."v2_rollup_refresh_state" (
  "rollup_name"       text                     NOT NULL,
  "bucket_start"      timestamp with time zone NOT NULL,
  "last_started_at"   timestamp with time zone,
  "last_completed_at" timestamp with time zone,
  "source_watermark"  timestamp with time zone,
  "status"            text                     NOT NULL DEFAULT 'pending'::text,
  "error_message"     text,
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_rollup_refresh_state_pkey" PRIMARY KEY (rollup_name, bucket_start),
  CONSTRAINT "v2_rollup_refresh_state_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'complete'::text, 'failed'::text])))
);

ALTER TABLE "public"."v2_rollup_refresh_state"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_rollup_refresh_state_status_idx ON public.v2_rollup_refresh_state USING btree (status, bucket_start);

CREATE POLICY "service_role_full_access" ON "public"."v2_rollup_refresh_state"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_rollup_refresh_state" TO "service_role";

COMMENT ON TABLE "public"."v2_rollup_refresh_state" IS 'Incremental refresh watermark and retry state; refresh jobs should reprocess recent buckets for late request updates.';

REVOKE ALL ON TABLE "public"."v2_rollup_refresh_state" FROM "anon", "authenticated";

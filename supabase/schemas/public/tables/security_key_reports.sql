CREATE TABLE "public"."security_key_reports" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "received_at"       timestamp with time zone NOT NULL DEFAULT (now() AT TIME ZONE 'utc'::text),
  "source"            text,
  "reporter_email"    text,
  "evidence_url"      text,
  "comment"           text,
  "token_prefix"      text,
  "token_fingerprint" text,
  "matched"           boolean                  NOT NULL DEFAULT false,
  "key_table"         text,
  "api_key_id"        uuid,
  "workspace_id"      uuid,
  "action_taken"      text,
  "report_mode"       text,
  "ip_hash"           text,
  "user_agent_hash"   text,
  "status"            text                     NOT NULL DEFAULT 'received'::text,
  "token_last_four"   text,
  "action_taken_at"   timestamp with time zone,
  "action_taken_by"   uuid,
  CONSTRAINT "security_key_reports_pkey" PRIMARY KEY (id),
  CONSTRAINT "security_key_reports_action_taken_by_fkey" FOREIGN KEY (action_taken_by) REFERENCES public.users(user_id) ON DELETE SET NULL,
  CONSTRAINT "security_key_reports_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL
);

ALTER TABLE "public"."security_key_reports"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX security_key_reports_action_taken_by_idx ON public.security_key_reports USING btree (action_taken_by);

CREATE INDEX security_key_reports_matched_idx ON public.security_key_reports USING btree (matched, received_at DESC);

CREATE INDEX security_key_reports_received_at_idx ON public.security_key_reports USING btree (received_at DESC);

CREATE INDEX security_key_reports_status_received_idx ON public.security_key_reports USING btree (status, received_at DESC);

CREATE INDEX security_key_reports_token_fingerprint_idx ON public.security_key_reports USING btree (token_fingerprint);

CREATE INDEX security_key_reports_workspace_id_idx ON public.security_key_reports USING btree (workspace_id);

CREATE POLICY "service_role_full_access" ON "public"."security_key_reports"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."security_key_reports" TO "service_role";

REVOKE ALL ON TABLE "public"."security_key_reports" FROM "anon", "authenticated";

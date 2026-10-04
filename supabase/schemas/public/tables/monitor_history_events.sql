CREATE TABLE "public"."monitor_history_events" (
  "event_id"       text                     NOT NULL,
  "commit_sha"     text                     NOT NULL,
  "committed_at"   timestamp with time zone NOT NULL,
  "provider_kind"  text                     NOT NULL,
  "provider_slug"  text,
  "provider_label" text                     NOT NULL,
  "model_id"       text                     NOT NULL,
  "model_label"    text                     NOT NULL,
  "endpoint"       text,
  "field"          text                     NOT NULL DEFAULT ''::text,
  "old_value"      jsonb,
  "new_value"      jsonb,
  "percent_change" double precision,
  "action"         text,
  "entity_id"      text,
  "entity_type"    text,
  "org_id"         text,
  "change_kind"    text                     NOT NULL,
  "source_file"    text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "monitor_history_events_commit_sha_fkey" FOREIGN KEY (commit_sha) REFERENCES public.monitor_history_commits(commit_sha) ON DELETE CASCADE,
  CONSTRAINT "monitor_history_events_pkey" PRIMARY KEY (event_id)
);

ALTER TABLE "public"."monitor_history_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX monitor_history_events_change_kind_idx ON public.monitor_history_events USING btree (change_kind, committed_at DESC);

CREATE INDEX monitor_history_events_commit_idx ON public.monitor_history_events USING btree (commit_sha, committed_at DESC);

CREATE INDEX monitor_history_events_model_id_idx ON public.monitor_history_events USING btree (model_id, committed_at DESC);

CREATE INDEX monitor_history_events_provider_slug_idx ON public.monitor_history_events USING btree (provider_slug, committed_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."monitor_history_events"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."monitor_history_events" TO "service_role";

REVOKE ALL ON TABLE "public"."monitor_history_events" FROM "anon", "authenticated";

CREATE TABLE "public"."model_discovery_issue_signals" (
  "source"               text                     NOT NULL,
  "provider_id"          text                     NOT NULL,
  "action"               text                     NOT NULL,
  "model_id"             text                     NOT NULL,
  "entry"                jsonb                    NOT NULL,
  "consecutive_sweeps"   integer                  NOT NULL DEFAULT 1,
  "first_observed_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "last_observed_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "last_observed_run_id" uuid,
  "emitted_at"           timestamp with time zone,
  CONSTRAINT "model_discovery_issue_signals_action_check" CHECK ((action = 'delete'::text)),
  CONSTRAINT "model_discovery_issue_signals_consecutive_sweeps_check" CHECK ((consecutive_sweeps > 0)),
  CONSTRAINT "model_discovery_issue_signals_pkey" PRIMARY KEY (source, provider_id, action, model_id)
);

ALTER TABLE "public"."model_discovery_issue_signals"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX model_discovery_issue_signals_pending_idx ON public.model_discovery_issue_signals USING btree (provider_id, emitted_at)
  WHERE (emitted_at IS NULL);

CREATE POLICY "service_role_full_access" ON "public"."model_discovery_issue_signals"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."model_discovery_issue_signals" TO "service_role";

REVOKE ALL ON TABLE "public"."model_discovery_issue_signals" FROM "anon", "authenticated";

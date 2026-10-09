CREATE TABLE "public"."data_contributions" (
  "public_reporting_allowed" boolean NOT NULL DEFAULT false,
  "id"                         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"               uuid                     NOT NULL,
  "request_id"                 text                     NOT NULL,
  "occurred_at"                timestamp with time zone NOT NULL DEFAULT now(),
  "endpoint"                   text                     NOT NULL,
  "model_slug"                 text                     NOT NULL,
  "provider_slug"              text,
  "object_key"                 text                     NOT NULL,
  "object_bytes"               integer                  NOT NULL,
  "object_sha256"              text                     NOT NULL,
  "retention_until"            timestamp with time zone NOT NULL,
  "consent_policy_version"     text                     NOT NULL,
  "sample_rate_bps"            integer                  NOT NULL,
  "classifier_sample_rate_bps" integer                  NOT NULL,
  "sample_bucket"              integer                  NOT NULL,
  "redaction_version"          text                     NOT NULL,
  "redaction_count"            integer                  NOT NULL DEFAULT 0,
  "discount_bps"               integer                  NOT NULL,
  "discount_nanos"             bigint                   NOT NULL DEFAULT 0,
  "input_tokens"               bigint,
  "output_tokens"              bigint,
  "status"                     text                     NOT NULL DEFAULT 'pending'::text,
  "attempt_count"              integer                  NOT NULL DEFAULT 0,
  "available_at"               timestamp with time zone NOT NULL DEFAULT now(),
  "lease_expires_at"           timestamp with time zone,
  "last_error"                 text,
  "completed_at"               timestamp with time zone,
  "created_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "data_contributions_attempt_count_check" CHECK ((attempt_count >= 0)),
  CONSTRAINT "data_contributions_classifier_sample_rate_bps_check" CHECK (((classifier_sample_rate_bps >= 0) AND (classifier_sample_rate_bps <= 10000))),
  CONSTRAINT "data_contributions_discount_bps_check" CHECK (((discount_bps >= 0) AND (discount_bps <= 10000))),
  CONSTRAINT "data_contributions_discount_nanos_check" CHECK ((discount_nanos >= 0)),
  CONSTRAINT "data_contributions_input_tokens_check" CHECK (((input_tokens IS NULL) OR (input_tokens >= 0))),
  CONSTRAINT "data_contributions_object_bytes_check" CHECK ((object_bytes > 0)),
  CONSTRAINT "data_contributions_output_tokens_check" CHECK (((output_tokens IS NULL) OR (output_tokens >= 0))),
  CONSTRAINT "data_contributions_pkey" PRIMARY KEY (id),
  CONSTRAINT "data_contributions_redaction_count_check" CHECK ((redaction_count >= 0)),
  CONSTRAINT "data_contributions_sample_bucket_check" CHECK (((sample_bucket >= 0) AND (sample_bucket <= 9999))),
  CONSTRAINT "data_contributions_sample_rate_bps_check" CHECK (((sample_rate_bps >= 0) AND (sample_rate_bps <= 10000))),
  CONSTRAINT "data_contributions_status_check"
    CHECK ((status = ANY (ARRAY['retained'::text, 'pending'::text, 'processing'::text, 'complete'::text, 'failed'::text, 'deleted'::text]))),
  CONSTRAINT "data_contributions_workspace_id_request_id_key" UNIQUE (workspace_id, request_id),
  CONSTRAINT "data_contributions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."data_contributions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX data_contributions_claim_idx ON public.data_contributions USING btree (available_at, occurred_at, id)
  WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));

CREATE INDEX data_contributions_claimable_idx ON public.data_contributions USING btree ((
CASE
    WHEN (status = 'processing'::text) THEN lease_expires_at
    ELSE available_at
END), occurred_at, id)
  WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text, 'processing'::text]));

CREATE INDEX data_contributions_retention_idx ON public.data_contributions USING btree (retention_until)
  WHERE (status <> 'deleted'::text);

CREATE INDEX data_contributions_stale_lease_idx ON public.data_contributions USING btree (lease_expires_at, occurred_at, id)
  WHERE (status = 'processing'::text);

CREATE INDEX data_contributions_workspace_created_idx ON public.data_contributions USING btree (workspace_id, created_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."data_contributions"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."data_contributions" TO "service_role";

COMMENT ON TABLE "public"."data_contributions" IS 'Service-only metadata and work queue. Prompt/completion content lives only in the dedicated R2 bucket.';

REVOKE ALL ON TABLE "public"."data_contributions" FROM "anon", "authenticated";

create trigger set_public_reporting_scope before insert or update on public.data_contributions
for each row execute function private.set_contribution_public_reporting_scope();

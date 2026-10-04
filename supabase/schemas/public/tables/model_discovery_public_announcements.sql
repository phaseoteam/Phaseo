CREATE TABLE "public"."model_discovery_public_announcements" (
  "model_slug"                 text                     NOT NULL,
  "status"                     text                     NOT NULL DEFAULT 'pending'::text,
  "last_run_id"                uuid,
  "first_seen_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "last_attempt_at"            timestamp with time zone,
  "announced_at"               timestamp with time zone,
  "attempt_count"              integer                  NOT NULL DEFAULT 0,
  "last_error"                 text,
  "claim_run_id"               uuid,
  "claim_expires_at"           timestamp with time zone,
  "updated_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "catalogue_status_snapshot"  text,
  "public_visibility_snapshot" boolean,
  CONSTRAINT "model_discovery_public_announcements_attempt_count_check" CHECK ((attempt_count >= 0)),
  CONSTRAINT "model_discovery_public_announcements_model_slug_check" CHECK ((NULLIF(TRIM(BOTH FROM model_slug), ''::text) IS NOT NULL)),
  CONSTRAINT "model_discovery_public_announcements_pkey" PRIMARY KEY (model_slug),
  CONSTRAINT "model_discovery_public_announcements_status_check" CHECK ((status = ANY (ARRAY['baseline'::text, 'pending'::text, 'announced'::text]))),
  CONSTRAINT "model_discovery_public_announcements_claim_run_id_fkey" FOREIGN KEY (claim_run_id) REFERENCES public.model_discovery_runs(id) ON DELETE SET NULL,
  CONSTRAINT "model_discovery_public_announcements_last_run_id_fkey" FOREIGN KEY (last_run_id) REFERENCES public.model_discovery_runs(id) ON DELETE SET NULL
);

ALTER TABLE "public"."model_discovery_public_announcements"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX model_discovery_public_announcements_claim_idx ON public.model_discovery_public_announcements USING btree (status, claim_expires_at, updated_at DESC);

CREATE INDEX model_discovery_public_announcements_status_idx ON public.model_discovery_public_announcements USING btree (status, updated_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."model_discovery_public_announcements"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."model_discovery_public_announcements" TO "service_role";

COMMENT ON COLUMN "public"."model_discovery_public_announcements"."catalogue_status_snapshot" IS 'Lifecycle status captured to detect a public catalog transition to available.';

COMMENT ON COLUMN "public"."model_discovery_public_announcements"."public_visibility_snapshot" IS 'Whether the model was public when the announcement state was last observed.';

COMMENT ON TABLE "public"."model_discovery_public_announcements" IS 'Database-backed cursor for public Phaseo model catalog announcements.';

REVOKE ALL ON TABLE "public"."model_discovery_public_announcements" FROM "anon", "authenticated";

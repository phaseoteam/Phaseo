CREATE TABLE "public"."provider_catalog_route_candidates" (
  "run_id"               uuid                     NOT NULL,
  "provider_slug"        text                     NOT NULL,
  "submitted_model_slug" text                     NOT NULL,
  "canonical_model_slug" text                     NOT NULL,
  "provider_model_slug"  text                     NOT NULL,
  "availability"         text                     NOT NULL,
  "input_modalities"     text[]                   NOT NULL DEFAULT '{}'::text[],
  "output_modalities"    text[]                   NOT NULL DEFAULT '{}'::text[],
  "context_length"       integer,
  "max_output_tokens"    integer,
  "available_from"       timestamp with time zone,
  "deprecated_at"        timestamp with time zone,
  "shutdown_at"          timestamp with time zone,
  "capabilities"         jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "pricing"              jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "status"               text                     NOT NULL DEFAULT 'pending_probe'::text,
  "probe_summary"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "probed_by"            uuid,
  "probed_at"            timestamp with time zone,
  "promoted_at"          timestamp with time zone,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_catalog_route_candidates_availability_check"
    CHECK ((availability = ANY (ARRAY['ready'::text, 'not_ready'::text, 'degraded'::text, 'deprecated'::text, 'retired'::text]))),
  CONSTRAINT "provider_catalog_route_candidates_pkey" PRIMARY KEY (run_id, submitted_model_slug),
  CONSTRAINT "provider_catalog_route_candidates_probed_by_fkey" FOREIGN KEY (probed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "provider_catalog_route_candidates_status_check"
    CHECK ((status = ANY (ARRAY['pending_probe'::text, 'probe_failed'::text, 'probe_passed'::text, 'promoted'::text, 'rejected'::text]))),
  CONSTRAINT "provider_catalog_route_candidates_run_id_fkey" FOREIGN KEY (run_id) REFERENCES public.provider_catalog_sync_runs(id) ON DELETE CASCADE,
  CONSTRAINT "provider_catalog_route_candidates_canonical_model_slug_fkey" FOREIGN KEY (canonical_model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE,
  CONSTRAINT "provider_catalog_route_candidates_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE
);

ALTER TABLE "public"."provider_catalog_route_candidates"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX provider_catalog_route_candidates_canonical_model_slug_idx ON public.provider_catalog_route_candidates USING btree (canonical_model_slug);

CREATE INDEX provider_catalog_route_candidates_probed_by_idx ON public.provider_catalog_route_candidates USING btree (probed_by);

CREATE INDEX provider_catalog_route_candidates_provider_slug_idx ON public.provider_catalog_route_candidates USING btree (provider_slug);

CREATE INDEX provider_catalog_route_candidates_queue_idx ON public.provider_catalog_route_candidates USING btree (status, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."provider_catalog_route_candidates"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE "public"."provider_catalog_route_candidates" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_catalog_route_candidates" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_route_candidates" FROM "anon", "authenticated";

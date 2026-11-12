CREATE TABLE "public"."provider_catalog_events" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "provider_slug"   text                     NOT NULL,
  "run_id"          uuid,
  "account_user_id" uuid,
  "workspace_id"    uuid,
  "event_type"      text                     NOT NULL,
  "title"           text                     NOT NULL,
  "message"         text                     NOT NULL,
  "payload"         jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "read_at"         timestamp with time zone,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "provider_catalog_events_account_user_id_fkey" FOREIGN KEY (account_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "provider_catalog_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "provider_catalog_events_type_check"
    CHECK
    ((event_type = ANY (ARRAY['catalog_applied'::text, 'catalog_needs_changes'::text, 'model_auto_approved'::text, 'model_approved'::text, 'model_rejected'::text,
    'model_needs_changes'::text, 'route_staged'::text, 'provider_application_reviewed'::text]))),
  CONSTRAINT "provider_catalog_events_run_id_fkey" FOREIGN KEY (run_id) REFERENCES public.provider_catalog_sync_runs(id) ON DELETE CASCADE,
  CONSTRAINT "provider_catalog_events_provider_slug_fkey" FOREIGN KEY (provider_slug) REFERENCES public.v2_providers(provider_slug) ON DELETE CASCADE,
  CONSTRAINT "provider_catalog_events_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."provider_catalog_events"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX provider_catalog_events_account_idx ON public.provider_catalog_events USING btree (account_user_id, created_at DESC);

CREATE INDEX provider_catalog_events_provider_slug_idx ON public.provider_catalog_events USING btree (provider_slug);

CREATE INDEX provider_catalog_events_run_id_idx ON public.provider_catalog_events USING btree (run_id);

CREATE INDEX provider_catalog_events_workspace_idx ON public.provider_catalog_events USING btree (workspace_id, created_at DESC);

CREATE TRIGGER enqueue_provider_catalog_event_email_trigger
  AFTER INSERT ON public.provider_catalog_events
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_provider_catalog_event_email();

CREATE POLICY "deny_direct_client_access" ON "public"."provider_catalog_events"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."provider_catalog_events" IS 'Provider-facing catalog workflow notification outbox. Delivery channels can consume these events later.';

REVOKE ALL ON TABLE "public"."provider_catalog_events" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."provider_catalog_events" TO "service_role";

REVOKE ALL ON TABLE "public"."provider_catalog_events" FROM "anon", "authenticated";

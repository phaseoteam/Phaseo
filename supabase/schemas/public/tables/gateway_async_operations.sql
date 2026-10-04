CREATE TABLE "public"."gateway_async_operations" (
  "id"                   uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"         uuid                     NOT NULL,
  "kind"                 text                     NOT NULL,
  "internal_id"          text                     NOT NULL,
  "native_id"            text,
  "provider"             text,
  "model"                text,
  "status"               text,
  "meta"                 jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "billed_at"            timestamp with time zone,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "request_id"           text,
  "session_id"           text,
  "app_id"               uuid,
  "next_reconcile_at"    timestamp with time zone,
  "reconcile_attempts"   integer                  NOT NULL DEFAULT 0,
  "reconcile_locked_at"  timestamp with time zone,
  "reconcile_locked_by"  text,
  "last_reconcile_error" text,
  CONSTRAINT "gateway_async_operations_app_id_fkey" FOREIGN KEY (app_id) REFERENCES public.api_apps(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_async_operations_kind_check" CHECK ((kind = ANY (ARRAY['video'::text, 'batch'::text, 'music'::text]))),
  CONSTRAINT "gateway_async_operations_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_async_operations_workspace_kind_internal_unique" UNIQUE (workspace_id, kind, internal_id),
  CONSTRAINT "gateway_async_operations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_async_operations"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_async_operations_app_id_idx ON public.gateway_async_operations USING btree (app_id)
  WHERE (app_id IS NOT NULL);

CREATE INDEX gateway_async_operations_kind_provider_native_created_idx ON public.gateway_async_operations USING btree (kind, PROVIDER, native_id, created_at DESC)
  WHERE ((PROVIDER IS NOT NULL) AND (native_id IS NOT NULL));

CREATE INDEX gateway_async_operations_kind_status_updated_idx ON public.gateway_async_operations USING btree (kind, status, updated_at)
  WHERE (status IS NOT NULL);

CREATE INDEX gateway_async_operations_kind_unbilled_updated_idx ON public.gateway_async_operations USING btree (kind, updated_at)
  WHERE (billed_at IS NULL);

CREATE INDEX gateway_async_operations_reconcile_due_idx ON public.gateway_async_operations USING btree (kind, next_reconcile_at NULLS FIRST, updated_at)
  WHERE (billed_at IS NULL);

CREATE INDEX gateway_async_operations_reconcile_lock_idx ON public.gateway_async_operations USING btree (kind, reconcile_locked_at)
  WHERE ((billed_at IS NULL) AND (reconcile_locked_at IS NOT NULL));

CREATE INDEX gateway_async_operations_workspace_app_updated_idx ON public.gateway_async_operations USING btree (workspace_id, app_id, updated_at DESC)
  WHERE (app_id IS NOT NULL);

CREATE INDEX gateway_async_operations_workspace_kind_created_idx ON public.gateway_async_operations USING btree (workspace_id, kind, created_at DESC);

CREATE INDEX gateway_async_operations_workspace_kind_native_idx ON public.gateway_async_operations USING btree (workspace_id, kind, native_id)
  WHERE (native_id IS NOT NULL);

CREATE INDEX gateway_async_operations_workspace_kind_status_updated_idx ON public.gateway_async_operations USING btree (workspace_id, kind, status, updated_at DESC);

CREATE INDEX gateway_async_operations_workspace_kind_updated_idx ON public.gateway_async_operations USING btree (workspace_id, kind, updated_at DESC);

CREATE INDEX gateway_async_operations_workspace_request_updated_idx ON public.gateway_async_operations USING btree (workspace_id, request_id, updated_at DESC)
  WHERE (request_id IS NOT NULL);

CREATE INDEX gateway_async_operations_workspace_session_updated_idx ON public.gateway_async_operations USING btree (workspace_id, session_id, updated_at DESC)
  WHERE (session_id IS NOT NULL);

CREATE TRIGGER gateway_async_operation_video_webhook_outbox
  AFTER INSERT OR UPDATE OF status ON public.gateway_async_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.gateway_async_operation_video_webhook_outbox();

CREATE TRIGGER gateway_billing_alert_capture
  AFTER INSERT OR UPDATE OF meta, billed_at ON public.gateway_async_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_gateway_billing_alert();

CREATE POLICY "gateway_async_operations_insert_service" ON "public"."gateway_async_operations"
  FOR INSERT
  TO "service_role"
  WITH CHECK (true);

CREATE POLICY "gateway_async_operations_select_own_team" ON "public"."gateway_async_operations"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "gateway_async_operations_update_service" ON "public"."gateway_async_operations"
  FOR UPDATE
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_async_operations" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."gateway_async_operations"."internal_id" IS 'Gateway-facing identifier used on retrieval routes (e.g. /videos/{id}, /batches/{id}).';

COMMENT ON COLUMN "public"."gateway_async_operations"."last_reconcile_error" IS 'Last reconciliation error summary, cleared after a successful attempt.';

COMMENT ON COLUMN "public"."gateway_async_operations"."native_id" IS 'Provider-native operation identifier for upstream polling APIs.';

COMMENT ON COLUMN "public"."gateway_async_operations"."next_reconcile_at" IS 'Next time a scheduled reconciler should claim this async operation for provider status refresh/finalization.';

COMMENT ON COLUMN "public"."gateway_async_operations"."reconcile_attempts" IS 'Number of reconciliation claim attempts. Used for bounded retry backoff.';

COMMENT ON COLUMN "public"."gateway_async_operations"."reconcile_locked_at" IS 'Lease timestamp set by claim_gateway_async_operations_for_reconciliation to avoid duplicate workers.';

COMMENT ON COLUMN "public"."gateway_async_operations"."reconcile_locked_by" IS 'Worker identifier holding the current reconciliation lease.';

COMMENT ON COLUMN "public"."gateway_async_operations"."request_id" IS 'Gateway request_id that initiated this async operation.';

COMMENT ON COLUMN "public"."gateway_async_operations"."session_id" IS 'Session identifier copied from the originating request for grouping.';

COMMENT ON TABLE "public"."gateway_async_operations" IS 'Team-scoped registry for long-running operations (video, batch, music) with ownership and billing markers.';

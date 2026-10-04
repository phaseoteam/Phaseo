CREATE TABLE "public"."gateway_realtime_sessions" (
  "id"                          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "session_id"                  text                     NOT NULL,
  "workspace_id"                uuid                     NOT NULL,
  "key_id"                      uuid,
  "user_id"                     text,
  "source"                      text                     NOT NULL DEFAULT 'api'::text,
  "provider"                    text                     NOT NULL,
  "model_id"                    text                     NOT NULL,
  "provider_model_id"           text,
  "voice"                       text,
  "status"                      text                     NOT NULL DEFAULT 'created'::text,
  "started_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "connected_at"                timestamp with time zone,
  "ended_at"                    timestamp with time zone,
  "expires_at"                  timestamp with time zone,
  "last_event_at"               timestamp with time zone,
  "reservation_prefix"          text                     NOT NULL,
  "reservation_count"           integer                  NOT NULL DEFAULT 0,
  "reserved_nanos"              bigint                   NOT NULL DEFAULT 0,
  "captured_nanos"              bigint                   NOT NULL DEFAULT 0,
  "released_nanos"              bigint                   NOT NULL DEFAULT 0,
  "estimated_cost_nanos"        bigint                   NOT NULL DEFAULT 0,
  "final_cost_nanos"            bigint,
  "currency"                    text                     NOT NULL DEFAULT 'USD'::text,
  "usage"                       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "pricing_lines"               jsonb                    NOT NULL DEFAULT '[]'::jsonb,
  "provider_session_id"         text,
  "provider_native_id"          text,
  "provider_client_secret_hash" text,
  "disconnect_reason"           text,
  "error_code"                  text,
  "error_message"               text,
  "metadata"                    jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_realtime_sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "gateway_realtime_sessions_session_id_key" UNIQUE (session_id),
  CONSTRAINT "gateway_realtime_sessions_source_check" CHECK ((source = ANY (ARRAY['api'::text, 'chat'::text]))),
  CONSTRAINT "gateway_realtime_sessions_status_check"
    CHECK
    ((status = ANY (ARRAY['created'::text, 'connecting'::text, 'connected'::text, 'ending'::text, 'billing_unresolved'::text, 'completed'::text, 'failed'::text, 'cancelled'::text,
    'expired'::text]))),
  CONSTRAINT "gateway_realtime_sessions_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE SET NULL,
  CONSTRAINT "gateway_realtime_sessions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_realtime_sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_gateway_realtime_sessions_active_provider ON public.gateway_realtime_sessions USING btree (lower(PROVIDER))
  WHERE (status = ANY (ARRAY['created'::text, 'connecting'::text, 'connected'::text, 'ending'::text]));

CREATE INDEX idx_gateway_realtime_sessions_key_created ON public.gateway_realtime_sessions USING btree (key_id, created_at DESC);

CREATE INDEX idx_gateway_realtime_sessions_status_updated ON public.gateway_realtime_sessions USING btree (status, updated_at DESC);

CREATE INDEX idx_gateway_realtime_sessions_workspace_created ON public.gateway_realtime_sessions USING btree (workspace_id, created_at DESC);

CREATE TRIGGER gateway_realtime_provider_concurrency_guard
  BEFORE INSERT ON public.gateway_realtime_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.gateway_realtime_enforce_provider_concurrency();

CREATE TRIGGER realtime_billing_review_admission
  BEFORE INSERT ON public.gateway_realtime_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.gateway_realtime_review_admission();

CREATE TRIGGER realtime_billing_review_lifecycle
  AFTER UPDATE OF status, USAGE, metadata ON public.gateway_realtime_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.gateway_realtime_review_lifecycle();

CREATE POLICY "gateway_realtime_sessions_service_all" ON "public"."gateway_realtime_sessions"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_realtime_sessions" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_realtime_sessions" TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_realtime_sessions" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_realtime_sessions" TO "authenticated";

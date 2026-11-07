CREATE TABLE "public"."v2_request_attempts" (
  "attempt_id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "request_event_id"     uuid                     NOT NULL,
  "attempt_number"       smallint                 NOT NULL,
  "provider_model_id"    text,
  "started_at"           timestamp with time zone,
  "completed_at"         timestamp with time zone,
  "status_code"          integer,
  "success"              boolean                  NOT NULL DEFAULT false,
  "error_code"           text,
  "failure_class"        text,
  "upstream_response_id" text,
  "latency_ms"           integer,
  "safe_metadata"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "cloudflare_colo"      text,
  "health_class"         text,
  "health_reason"        text,
  CONSTRAINT "v2_request_attempts_cloudflare_colo_check" CHECK (((cloudflare_colo IS NULL) OR (cloudflare_colo ~ '^[A-Z0-9]{3}$'::text))),
  CONSTRAINT "v2_request_attempts_health_class_check" CHECK (((health_class IS NULL) OR (health_class = ANY (ARRAY['success'::text, 'reachability'::text, 'capacity'::text, 'call_error'::text, 'customer'::text, 'phaseo'::text])))),
  CONSTRAINT "v2_request_attempts_health_reason_check" CHECK (((health_reason IS NULL) OR (health_reason ~ '^[a-z][a-z0-9_]{0,63}$'::text))),
  CONSTRAINT "v2_request_attempts_key" UNIQUE (request_event_id, attempt_number),
  CONSTRAINT "v2_request_attempts_latency_check" CHECK (((latency_ms IS NULL) OR (latency_ms >= 0))),
  CONSTRAINT "v2_request_attempts_number_check" CHECK ((attempt_number > 0)),
  CONSTRAINT "v2_request_attempts_pkey" PRIMARY KEY (attempt_id),
  CONSTRAINT "v2_request_attempts_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id) ON DELETE SET NULL,
  CONSTRAINT "v2_request_attempts_status_code_check" CHECK (((status_code IS NULL) OR ((status_code >= 100) AND (status_code <= 599)))),
  CONSTRAINT "v2_request_attempts_window_check" CHECK (((completed_at IS NULL) OR (started_at IS NULL) OR (completed_at >= started_at))),
  CONSTRAINT "v2_request_attempts_request_event_id_fkey" FOREIGN KEY (request_event_id) REFERENCES public.v2_request_facts(request_event_id) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_request_attempts"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_request_attempts_route_time_idx ON public.v2_request_attempts USING btree (provider_model_id, started_at DESC)
  WHERE (provider_model_id IS NOT NULL);

CREATE TRIGGER sync_v2_request_fact_provider_model_id
  AFTER INSERT OR UPDATE OF provider_model_id ON public.v2_request_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_v2_request_fact_provider_model_id();

CREATE TRIGGER v2_request_attempts_analytics_correction
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_request_attempts
  FOR EACH ROW
  EXECUTE FUNCTION private.enqueue_v2_analytics_meter_correction();

CREATE TRIGGER v2_request_attempts_health_refresh
  AFTER INSERT OR DELETE OR UPDATE ON public.v2_request_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_v2_provider_health_for_attempt();

CREATE POLICY "v2_request_attempts_no_oauth_client_insert" ON "public"."v2_request_attempts"
  AS RESTRICTIVE
  FOR INSERT
  TO "authenticated"
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_attempts_no_oauth_client_update" ON "public"."v2_request_attempts"
  AS RESTRICTIVE
  FOR UPDATE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client))
  WITH CHECK (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "v2_request_attempts_no_oauth_client_delete" ON "public"."v2_request_attempts"
  AS RESTRICTIVE
  FOR DELETE
  TO "authenticated"
  USING (NOT ( SELECT public.request_is_oauth_client() AS request_is_oauth_client));

CREATE POLICY "mfa_required_when_enrolled" ON "public"."v2_request_attempts"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.mfa_satisfied() AS mfa_satisfied))
  WITH CHECK (( SELECT public.mfa_satisfied() AS mfa_satisfied));

CREATE POLICY "v2_request_attempts_workspace_select" ON "public"."v2_request_attempts"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.v2_request_facts request
  WHERE ((request.request_event_id = v2_request_attempts.request_event_id) AND ( SELECT public.is_workspace_member(request.workspace_id) AS is_workspace_member)))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_request_attempts" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."v2_request_attempts"."cloudflare_colo" IS 'Cloudflare execution colo associated with the gateway request attempt.';

COMMENT ON COLUMN "public"."v2_request_attempts"."health_class" IS 'What the attempt says about its provider: success, reachability, capacity or call_error (provider failures), or customer / phaseo (excluded from provider metrics). Null on rows recorded before the gateway classified attempts.';

COMMENT ON COLUMN "public"."v2_request_attempts"."health_reason" IS 'Why the attempt got its health_class, for example route_model_not_found, provider_rejected_request_accepted_elsewhere, rate_limited or client_cancelled (apps/api/src/pipeline/execute/attempt-health.ts). Null for a plain success and on rows recorded before the gateway sent reasons.';

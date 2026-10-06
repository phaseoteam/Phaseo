CREATE TABLE "public"."v2_request_facts" (
  "request_event_id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"                uuid                     NOT NULL,
  "request_id"                  text                     NOT NULL,
  "occurred_at"                 timestamp with time zone NOT NULL DEFAULT now(),
  "app_id"                      uuid,
  "key_id"                      uuid,
  "endpoint"                    text                     NOT NULL,
  "requested_model_input"       text                     NOT NULL,
  "requested_model_slug"        text,
  "routed_model_slug"           text,
  "provider_model_id"           text,
  "status_code"                 integer,
  "success"                     boolean                  NOT NULL DEFAULT false,
  "error_code"                  text,
  "stop_reason"                 text,
  "tool_call_count"             integer                  NOT NULL DEFAULT 0,
  "structured_output_attempted" boolean                  NOT NULL DEFAULT false,
  "structured_output_succeeded" boolean                  NOT NULL DEFAULT false,
  "stream"                      boolean                  NOT NULL DEFAULT false,
  "byok"                        boolean                  NOT NULL DEFAULT false,
  "latency_ms"                  integer,
  "time_to_first_token_ms"      integer,
  "generation_ms"               integer,
  "queue_ms"                    integer,
  "upstream_latency_ms"         integer,
  "upstream_attempt_count"      smallint                 NOT NULL DEFAULT 0,
  "throughput"                  numeric(30,12),
  "user_agent"                  text,
  "sdk_name"                    text,
  "sdk_version"                 text,
  "client_version"              text,
  "region"                      text,
  "safe_metadata"               jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "cloudflare_colo"             text,
  "internal_dispatch_ms"        numeric(12,3),
  "gateway_total_ms"            numeric(12,3),
  "session_id"                  text,
  "end_user_id"                 text,
  "auth_method"                 text,
  "native_response_id"          text,
  "cost_nanos"                  bigint,
  "currency"                    text,
  "tool_call_succeeded"         boolean,
  "gateway_request_id"          uuid                     NOT NULL,
  "gateway_request_created_at"  timestamp with time zone NOT NULL,
  "edge_country"                text,
  "edge_continent"              text,
  "provider_ttft_ms"            integer,
  "gateway_ttft_ms"             integer,
  "output_speed_tps"            numeric(30,12),
  "tpot_ms"                     numeric(30,12),
  "itl_ms"                      numeric(30,12),
  "phaseo_overhead_ms"          integer,
  "service_tier_requested"      text,
  "service_tier_observed"       text,
  "service_tier_slug"           text,
  CONSTRAINT "v2_request_facts_app_id_fkey" FOREIGN KEY (app_id) REFERENCES public.api_apps(id) ON DELETE SET NULL,
  CONSTRAINT "v2_request_facts_attempt_count_check" CHECK ((upstream_attempt_count >= 0)),
  CONSTRAINT "v2_request_facts_auth_method_check" CHECK (((auth_method IS NULL) OR (auth_method = ANY (ARRAY['api_key'::text, 'oauth'::text])))),
  CONSTRAINT "v2_request_facts_cloudflare_colo_check" CHECK (((cloudflare_colo IS NULL) OR (cloudflare_colo ~ '^[A-Z0-9]{3}$'::text))),
  CONSTRAINT "v2_request_facts_cost_check" CHECK (((cost_nanos IS NULL) OR (cost_nanos >= 0))),
  CONSTRAINT "v2_request_facts_gateway_request_fkey" FOREIGN KEY (gateway_request_id, gateway_request_created_at) REFERENCES public.gateway_requests(id, created_at)
    ON DELETE CASCADE,
  CONSTRAINT "v2_request_facts_gateway_timing_check"
    CHECK ((((internal_dispatch_ms IS NULL) OR (internal_dispatch_ms >= (0)::numeric)) AND ((gateway_total_ms IS NULL) OR (gateway_total_ms >= (0)::numeric)))),
  CONSTRAINT "v2_request_facts_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE SET NULL,
  CONSTRAINT "v2_request_facts_model_input_check" CHECK ((length(TRIM(BOTH FROM requested_model_input)) > 0)),
  CONSTRAINT "v2_request_facts_performance_metrics_nonnegative"
    CHECK
    ((((provider_ttft_ms IS NULL) OR (provider_ttft_ms >= 0)) AND ((gateway_ttft_ms IS NULL) OR (gateway_ttft_ms >= 0)) AND ((output_speed_tps IS NULL) OR (output_speed_tps >=
    (0)::numeric)) AND ((tpot_ms IS NULL) OR (tpot_ms >= (0)::numeric)) AND ((itl_ms IS NULL) OR (itl_ms >= (0)::numeric)) AND
    ((phaseo_overhead_ms IS NULL) OR (phaseo_overhead_ms >= 0)))),
  CONSTRAINT "v2_request_facts_pkey" PRIMARY KEY (request_event_id),
  CONSTRAINT "v2_request_facts_provider_model_id_fkey" FOREIGN KEY (provider_model_id) REFERENCES public.v2_model_provider_routes(provider_model_id) ON DELETE SET NULL,
  CONSTRAINT "v2_request_facts_request_id_check" CHECK ((length(TRIM(BOTH FROM request_id)) > 0)),
  CONSTRAINT "v2_request_facts_request_key" UNIQUE (workspace_id, request_id),
  CONSTRAINT "v2_request_facts_requested_model_slug_fkey" FOREIGN KEY (requested_model_slug) REFERENCES public.v2_models(model_slug) ON DELETE SET NULL,
  CONSTRAINT "v2_request_facts_routed_model_slug_fkey" FOREIGN KEY (routed_model_slug) REFERENCES public.v2_models(model_slug) ON DELETE SET NULL,
  CONSTRAINT "v2_request_facts_service_tier_observed_check"
    CHECK (((service_tier_observed IS NULL) OR (service_tier_observed = ANY (ARRAY['standard'::text, 'priority'::text, 'ultrafast'::text, 'flex'::text, 'batch'::text])))),
  CONSTRAINT "v2_request_facts_service_tier_requested_check"
    CHECK (((service_tier_requested IS NULL) OR (service_tier_requested = ANY (ARRAY['standard'::text, 'priority'::text, 'ultrafast'::text, 'flex'::text, 'batch'::text])))),
  CONSTRAINT "v2_request_facts_service_tier_slug_check"
    CHECK (((service_tier_slug IS NULL) OR (service_tier_slug = ANY (ARRAY['standard'::text, 'priority'::text, 'ultrafast'::text, 'flex'::text, 'batch'::text])))),
  CONSTRAINT "v2_request_facts_status_code_check" CHECK (((status_code IS NULL) OR ((status_code >= 100) AND (status_code <= 599)))),
  CONSTRAINT "v2_request_facts_throughput_check" CHECK (((throughput IS NULL) OR (throughput >= (0)::numeric))),
  CONSTRAINT "v2_request_facts_timing_check"
    CHECK
    ((((latency_ms IS NULL) OR (latency_ms >= 0)) AND ((time_to_first_token_ms IS NULL) OR (time_to_first_token_ms >= 0)) AND ((generation_ms IS NULL) OR (generation_ms >= 0)) AND
    ((queue_ms IS NULL) OR (queue_ms >= 0)) AND ((upstream_latency_ms IS NULL) OR (upstream_latency_ms >= 0)))),
  CONSTRAINT "v2_request_facts_tool_count_check" CHECK ((tool_call_count >= 0)),
  CONSTRAINT "v2_request_facts_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."v2_request_facts"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."v2_request_facts"
  ADD COLUMN "client_source_id" text GENERATED ALWAYS AS (NULLIF((safe_metadata #>> '{client_source,id}'::text[]), ''::text)) STORED;

ALTER TABLE "public"."v2_request_facts"
  ADD COLUMN "client_source_name" text GENERATED ALWAYS AS (NULLIF((safe_metadata #>> '{client_source,name}'::text[]), ''::text)) STORED;

ALTER TABLE "public"."v2_request_facts"
  ADD COLUMN "client_source_kind" text GENERATED ALWAYS AS (NULLIF((safe_metadata #>> '{client_source,kind}'::text[]), ''::text)) STORED;

ALTER TABLE "public"."v2_request_facts"
  ADD COLUMN "client_source_version" text GENERATED ALWAYS AS (NULLIF((safe_metadata #>> '{client_source,version}'::text[]), ''::text)) STORED;

ALTER TABLE "public"."v2_request_facts"
  ADD COLUMN "client_source_detection" text GENERATED ALWAYS AS (NULLIF((safe_metadata #>> '{client_source,detection}'::text[]), ''::text)) STORED;

ALTER TABLE "public"."v2_request_facts"
  ADD CONSTRAINT "v2_request_facts_client_source_contract_check"
    CHECK
    ((((client_source_id IS NULL) AND (client_source_name IS NULL) AND (client_source_kind IS NULL) AND (client_source_version IS NULL) AND (client_source_detection IS NULL)) OR
    ((client_source_id IS NOT NULL) AND (client_source_name IS NOT NULL) AND (client_source_kind IS NOT NULL) AND (client_source_detection IS
    NOT NULL) AND
    (((client_source_id = 'api'::text) AND (client_source_name = 'Direct HTTP'::text) AND (client_source_kind = 'api'::text)) OR ((client_source_id = 'phaseo-typescript'::text) AND
    (client_source_name = 'Phaseo TypeScript SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'phaseo-python'::text) AND (client_source_name = 'Phaseo Python SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'phaseo-go'::text) AND (client_source_name = 'Phaseo Go SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'phaseo-java'::text) AND (client_source_name = 'Phaseo Java SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'phaseo-csharp'::text) AND (client_source_name = 'Phaseo C# SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'phaseo-cpp'::text) AND (client_source_name = 'Phaseo C++ SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'phaseo-php'::text) AND (client_source_name = 'Phaseo PHP SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'phaseo-ruby'::text) AND (client_source_name = 'Phaseo Ruby SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'phaseo-rust'::text) AND (client_source_name = 'Phaseo Rust SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'phaseo-agent-typescript'::text) AND (client_source_name = 'Phaseo Agent TypeScript SDK'::text) AND (client_source_kind = 'agent_sdk'::text)) OR
    ((client_source_id = 'phaseo-agent-python'::text) AND (client_source_name = 'Phaseo Agent Python SDK'::text) AND (client_source_kind = 'agent_sdk'::text)) OR
    ((client_source_id = 'phaseo-agent-go'::text) AND (client_source_name = 'Phaseo Agent Go SDK'::text) AND (client_source_kind = 'agent_sdk'::text)) OR
    ((client_source_id = 'phaseo-agent-java'::text) AND (client_source_name = 'Phaseo Agent Java SDK'::text) AND (client_source_kind = 'agent_sdk'::text)) OR
    ((client_source_id = 'phaseo-agent-csharp'::text) AND (client_source_name = 'Phaseo Agent C# SDK'::text) AND (client_source_kind = 'agent_sdk'::text)) OR
    ((client_source_id = 'phaseo-agent-php'::text) AND (client_source_name = 'Phaseo Agent PHP SDK'::text) AND (client_source_kind = 'agent_sdk'::text)) OR
    ((client_source_id = 'phaseo-agent-ruby'::text) AND (client_source_name = 'Phaseo Agent Ruby SDK'::text) AND (client_source_kind = 'agent_sdk'::text)) OR
    ((client_source_id = 'phaseo-agent-rust'::text) AND (client_source_name = 'Phaseo Agent Rust SDK'::text) AND (client_source_kind = 'agent_sdk'::text)) OR
    ((client_source_id = 'codex'::text) AND (client_source_name = 'Codex'::text) AND (client_source_kind = 'coding_agent'::text)) OR
    ((client_source_id = 'claude-code'::text) AND (client_source_name = 'Claude Code'::text) AND (client_source_kind = 'coding_agent'::text)) OR
    ((client_source_id = 'openai-typescript'::text) AND (client_source_name = 'OpenAI TypeScript SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'openai-python'::text) AND (client_source_name = 'OpenAI Python SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'anthropic-typescript'::text) AND (client_source_name = 'Anthropic TypeScript SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'anthropic-python'::text) AND (client_source_name = 'Anthropic Python SDK'::text) AND (client_source_kind = 'sdk'::text)) OR
    ((client_source_id = 'curl'::text) AND (client_source_name = 'cURL'::text) AND (client_source_kind = 'http_client'::text)) OR
    ((client_source_id = 'httpie'::text) AND (client_source_name = 'HTTPie'::text) AND (client_source_kind = 'http_client'::text)) OR
    ((client_source_id = 'postman'::text) AND (client_source_name = 'Postman'::text) AND (client_source_kind = 'http_client'::text)) OR
    ((client_source_id = 'insomnia'::text) AND (client_source_name = 'Insomnia'::text) AND (client_source_kind = 'http_client'::text)) OR
    ((client_source_id = 'axios'::text) AND (client_source_name = 'Axios'::text) AND (client_source_kind = 'http_client'::text)) OR
    ((client_source_id = 'python-requests'::text) AND (client_source_name = 'Python Requests'::text) AND (client_source_kind = 'http_client'::text))) AND
    (((client_source_id = 'api'::text) AND (client_source_detection = 'unknown'::text) AND (client_source_version IS NULL)) OR ((client_source_id <> 'api'::text) AND
    (client_source_detection = ANY (ARRAY['declared'::text, 'user_agent'::text])) AND ((client_source_version IS NULL) OR (char_length(client_source_version) <= 64)))))));

CREATE INDEX v2_request_facts_app_time_idx ON public.v2_request_facts USING btree (app_id, occurred_at DESC)
  WHERE (app_id IS NOT NULL);

CREATE INDEX v2_request_facts_country_time_idx ON public.v2_request_facts USING btree (edge_country, occurred_at DESC)
  WHERE (edge_country IS NOT NULL);

CREATE INDEX v2_request_facts_free_router_reporting_idx ON public.v2_request_facts USING btree (routed_model_slug, occurred_at) INCLUDE (request_event_id)
  WHERE (requested_model_input = 'phaseo/free'::text);

CREATE UNIQUE INDEX v2_request_facts_gateway_request_key ON public.v2_request_facts USING btree (gateway_request_id, gateway_request_created_at);

CREATE INDEX v2_request_facts_key_id_idx ON public.v2_request_facts USING btree (key_id)
  WHERE (key_id IS NOT NULL);

CREATE INDEX v2_request_facts_model_colo_time_idx ON public.v2_request_facts USING btree (requested_model_slug, cloudflare_colo, occurred_at DESC)
  WHERE (cloudflare_colo IS NOT NULL);

CREATE INDEX v2_request_facts_model_stream_context_time_idx ON public.v2_request_facts USING btree (COALESCE(routed_model_slug, requested_model_slug), stream, occurred_at DESC);

CREATE INDEX v2_request_facts_model_tier_time_idx ON public.v2_request_facts USING btree (COALESCE(routed_model_slug, requested_model_slug), service_tier_slug, occurred_at DESC)
  WHERE ((provider_model_id IS NOT NULL) AND (service_tier_slug IS NOT NULL));

CREATE INDEX v2_request_facts_model_time_idx ON public.v2_request_facts USING btree (requested_model_slug, occurred_at DESC);

CREATE INDEX v2_request_facts_occurred_brin_idx ON public.v2_request_facts USING brin (occurred_at);

CREATE INDEX v2_request_facts_public_distribution_idx ON public.v2_request_facts USING btree (occurred_at) INCLUDE (request_event_id, workspace_id, edge_country);

CREATE INDEX v2_request_facts_provider_route_time_idx ON public.v2_request_facts USING btree (provider_model_id, occurred_at DESC);

CREATE INDEX v2_request_facts_routed_colo_time_idx ON public.v2_request_facts USING btree (routed_model_slug, cloudflare_colo, occurred_at DESC)
  WHERE (cloudflare_colo IS NOT NULL);

CREATE INDEX v2_request_facts_routed_model_time_idx ON public.v2_request_facts USING btree (routed_model_slug, occurred_at DESC);

CREATE INDEX v2_request_facts_safe_metadata_gin_idx ON public.v2_request_facts USING gin (safe_metadata jsonb_path_ops);

CREATE INDEX v2_request_facts_success_reporting_time_idx ON public.v2_request_facts USING btree (occurred_at) INCLUDE (workspace_id, routed_model_slug, requested_model_slug)
  WHERE (success IS TRUE);

CREATE INDEX v2_request_facts_workspace_client_source_time_idx ON public.v2_request_facts USING btree (workspace_id, client_source_id, occurred_at DESC)
  WHERE (client_source_id IS NOT NULL);

CREATE INDEX v2_request_facts_workspace_country_time_idx ON public.v2_request_facts USING btree (workspace_id, edge_country, occurred_at DESC)
  WHERE (edge_country IS NOT NULL);

CREATE INDEX v2_request_facts_workspace_end_user_time_idx ON public.v2_request_facts USING btree (workspace_id, end_user_id, occurred_at DESC)
  WHERE (end_user_id IS NOT NULL);

CREATE INDEX v2_request_facts_workspace_provider_time_idx ON public.v2_request_facts USING btree (workspace_id, provider_model_id, occurred_at DESC)
  WHERE (provider_model_id IS NOT NULL);

CREATE INDEX v2_request_facts_workspace_session_time_idx ON public.v2_request_facts USING btree (workspace_id, session_id, occurred_at DESC)
  WHERE (session_id IS NOT NULL);

CREATE INDEX v2_request_facts_workspace_status_time_idx ON public.v2_request_facts USING btree (workspace_id, success, occurred_at DESC);

CREATE INDEX v2_request_facts_workspace_time_idx ON public.v2_request_facts USING btree (workspace_id, occurred_at DESC, request_event_id DESC);

CREATE TRIGGER sync_v2_public_effective_pricing_fact_after_update
  AFTER UPDATE ON public.v2_request_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_v2_public_effective_pricing_fact_update();

CREATE TRIGGER sync_v2_public_effective_pricing_fact_before_update
  BEFORE UPDATE ON public.v2_request_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_v2_public_effective_pricing_fact_update();

CREATE TRIGGER sync_v2_request_edge_geography
  BEFORE INSERT OR UPDATE OF safe_metadata ON public.v2_request_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_v2_request_edge_geography();

CREATE TRIGGER v2_request_facts_analytics_correction
  AFTER DELETE OR UPDATE ON public.v2_request_facts
  FOR EACH ROW
  EXECUTE FUNCTION private.enqueue_v2_analytics_fact_correction();

CREATE TRIGGER v2_request_facts_attach_gateway_request
  BEFORE INSERT OR UPDATE OF workspace_id, request_id, occurred_at, gateway_request_id, gateway_request_created_at ON public.v2_request_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.attach_v2_request_fact_to_gateway_request();

CREATE TRIGGER v2_request_facts_copy_performance_metrics
  BEFORE INSERT OR UPDATE OF safe_metadata ON public.v2_request_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.copy_v2_performance_metrics_from_metadata();

CREATE TRIGGER v2_request_facts_health_refresh
  BEFORE DELETE OR UPDATE ON public.v2_request_facts
  FOR EACH ROW
  EXECUTE FUNCTION private.enqueue_provider_health_for_fact();

CREATE TRIGGER v2_request_facts_public_reporting_refresh
  BEFORE INSERT OR DELETE OR UPDATE ON public.v2_request_facts
  FOR EACH ROW
  EXECUTE FUNCTION private.enqueue_public_reporting_for_fact();

CREATE TRIGGER v2_request_facts_service_tier
  BEFORE INSERT OR UPDATE OF service_tier_requested, service_tier_observed, service_tier_slug, safe_metadata, endpoint ON public.v2_request_facts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_v2_request_fact_service_tier();

CREATE POLICY "v2_request_facts_workspace_select" ON "public"."v2_request_facts"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT public.is_workspace_member(v2_request_facts.workspace_id) AS is_workspace_member));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_request_facts" TO "anon", "authenticated", "service_role";

COMMENT ON COLUMN "public"."v2_request_facts"."client_source_detection" IS 'Whether client identity was declared, inferred from user-agent, or unavailable.';

COMMENT ON COLUMN "public"."v2_request_facts"."client_source_id" IS 'Gateway-normalized client identity such as codex, claude-code, or phaseo-typescript.';

COMMENT ON COLUMN "public"."v2_request_facts"."cloudflare_colo" IS 'Cloudflare request execution colo, stored as the three-character edge code (for example LHR).';

COMMENT ON COLUMN "public"."v2_request_facts"."edge_continent" IS 'Two-letter Cloudflare continent code captured at request time.';

COMMENT ON COLUMN "public"."v2_request_facts"."edge_country" IS 'ISO 3166-1 alpha-2 country inferred by Cloudflare at request time; no raw IP is stored.';

COMMENT ON COLUMN "public"."v2_request_facts"."gateway_request_created_at" IS 'Partition key of the authoritative gateway_requests row extended by this fact.';

COMMENT ON COLUMN "public"."v2_request_facts"."gateway_request_id" IS 'Identifier of the authoritative gateway_requests row extended by this fact.';

COMMENT ON COLUMN "public"."v2_request_facts"."gateway_total_ms" IS 'Gateway end-to-end time: request entry through final response completion.';

COMMENT ON COLUMN "public"."v2_request_facts"."gateway_ttft_ms" IS 'Gateway request start to first content-bearing generated output; user-visible TTFT.';

COMMENT ON COLUMN "public"."v2_request_facts"."generation_ms" IS 'Upstream generation time: time from sending the selected upstream request to the final frame/completed response.';

COMMENT ON COLUMN "public"."v2_request_facts"."internal_dispatch_ms" IS 'Time from gateway request entry to the selected upstream provider fetch boundary.';

COMMENT ON COLUMN "public"."v2_request_facts"."itl_ms" IS 'Mean observed interval in milliseconds between successive content-bearing provider stream frames.';

COMMENT ON COLUMN "public"."v2_request_facts"."latency_ms" IS 'Upstream latency: time from sending the selected upstream request to the first streamed frame/response bytes.';

COMMENT ON COLUMN "public"."v2_request_facts"."output_speed_tps" IS 'Output speed after first token: output tokens after the first divided by provider duration after TTFT.';

COMMENT ON COLUMN "public"."v2_request_facts"."phaseo_overhead_ms" IS 'Gateway end-to-end duration minus selected-provider duration.';

COMMENT ON COLUMN "public"."v2_request_facts"."provider_ttft_ms" IS 'Selected provider dispatch to first content-bearing generated output; streaming text requests only.';

COMMENT ON COLUMN "public"."v2_request_facts"."requested_model_input" IS 'Exact client-supplied model value, which may be a canonical slug or alias.';

COMMENT ON COLUMN "public"."v2_request_facts"."requested_model_slug" IS 'Canonical slug resolved from requested_model_input.';

COMMENT ON COLUMN "public"."v2_request_facts"."routed_model_slug" IS 'Canonical slug actually selected for the request.';

COMMENT ON COLUMN "public"."v2_request_facts"."safe_metadata" IS 'Non-content metadata only. Includes optional request labels; prompt, completion, provider body, and tool I/O values are prohibited.';

COMMENT ON COLUMN "public"."v2_request_facts"."service_tier_observed" IS 'Canonical service tier reported by the upstream provider, when available.';

COMMENT ON COLUMN "public"."v2_request_facts"."service_tier_requested" IS 'Canonical service tier requested by the client; fast is stored as priority.';

COMMENT ON COLUMN "public"."v2_request_facts"."service_tier_slug" IS 'Effective canonical service tier used for pricing and performance attribution.';

COMMENT ON COLUMN "public"."v2_request_facts"."throughput" IS 'Effective output speed: all output tokens divided by the full selected-provider duration.';

COMMENT ON COLUMN "public"."v2_request_facts"."tool_call_count" IS 'Anonymous count of emitted tool calls/stop reasons; tool names, arguments, and results are never stored here.';

COMMENT ON COLUMN "public"."v2_request_facts"."tool_call_succeeded" IS 'Request-level success proxy when tool_call_count > 0; null when no tool-call signal exists.';

COMMENT ON COLUMN "public"."v2_request_facts"."tpot_ms" IS 'Average time per output token after the first token.';

COMMENT ON TABLE "public"."v2_request_facts" IS 'Queryable observability extension for one authoritative gateway_requests row; raw bodies never belong in Supabase.';

CREATE INDEX v2_request_facts_public_ranking_idx ON public.v2_request_facts USING btree (occurred_at)
  INCLUDE (request_event_id, routed_model_slug, requested_model_slug, provider_model_id, app_id, success, tool_call_count);

CREATE INDEX v2_request_facts_resolved_model_time_idx ON public.v2_request_facts USING btree
  ((COALESCE(routed_model_slug, requested_model_slug, requested_model_input)), occurred_at DESC);

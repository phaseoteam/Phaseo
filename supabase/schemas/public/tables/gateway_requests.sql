CREATE TABLE "public"."gateway_requests" (
  "id"                                uuid                     NOT NULL,
  "created_at"                        timestamp with time zone NOT NULL,
  "workspace_id"                      uuid                     NOT NULL,
  "request_id"                        text                     NOT NULL,
  "app_id"                            uuid,
  "endpoint"                          text                     NOT NULL,
  "model_id"                          text,
  "provider"                          text,
  "native_response_id"                text,
  "stream"                            boolean                  NOT NULL,
  "byok"                              boolean                  NOT NULL,
  "status_code"                       integer,
  "success"                           boolean                  NOT NULL,
  "error_code"                        text,
  "error_message"                     text,
  "latency_ms"                        integer,
  "generation_ms"                     integer,
  "usage"                             jsonb                    NOT NULL,
  "cost_nanos"                        bigint,
  "currency"                          text,
  "pricing_lines"                     jsonb                    NOT NULL,
  "key_id"                            uuid,
  "throughput"                        numeric,
  "location"                          text,
  "auth_method"                       text,
  "oauth_client_id"                   text,
  "oauth_user_id"                     uuid,
  "finish_reason"                     text,
  "end_user_id"                       text,
  "session_id"                        text,
  "trace_data"                        jsonb,
  "canonical_model_id"                text,
  "provider_attempts"                 jsonb                    NOT NULL,
  "error_payload"                     jsonb,
  "requested_model_id"                text,
  "routed_model_id"                   text,
  "usage_total_tokens"                bigint                   NOT NULL,
  "usage_input_tokens"                bigint                   NOT NULL,
  "usage_output_tokens"               bigint                   NOT NULL,
  "usage_reasoning_tokens"            bigint                   NOT NULL,
  "usage_input_text_tokens"           bigint                   NOT NULL,
  "usage_output_text_tokens"          bigint                   NOT NULL,
  "usage_input_image_tokens"          bigint                   NOT NULL,
  "usage_output_image_tokens"         bigint                   NOT NULL,
  "usage_input_audio_tokens"          bigint                   NOT NULL,
  "usage_output_audio_tokens"         bigint                   NOT NULL,
  "usage_input_video_tokens"          bigint                   NOT NULL,
  "usage_output_video_tokens"         bigint                   NOT NULL,
  "usage_image_inputs"                bigint                   NOT NULL,
  "usage_image_outputs"               bigint                   NOT NULL,
  "usage_audio_inputs"                bigint                   NOT NULL,
  "usage_audio_outputs"               bigint                   NOT NULL,
  "usage_video_inputs"                bigint                   NOT NULL,
  "usage_video_outputs"               bigint                   NOT NULL,
  "usage_cached_read_tokens"          bigint                   NOT NULL,
  "usage_cached_write_tokens"         bigint                   NOT NULL,
  "usage_cached_read_text_tokens"     bigint                   NOT NULL,
  "usage_cached_write_text_tokens"    bigint                   NOT NULL,
  "usage_cached_write_text_tokens_5m" bigint                   NOT NULL,
  "usage_cached_write_text_tokens_1h" bigint                   NOT NULL,
  "usage_cached_read_image_tokens"    bigint                   NOT NULL,
  "usage_cached_write_image_tokens"   bigint                   NOT NULL,
  "usage_cached_read_audio_tokens"    bigint                   NOT NULL,
  "usage_cached_write_audio_tokens"   bigint                   NOT NULL,
  "usage_cached_read_video_tokens"    bigint                   NOT NULL,
  "usage_cached_write_video_tokens"   bigint                   NOT NULL,
  "usage_input_quad_tokens"           bigint                   NOT NULL,
  "usage_output_quad_tokens"          bigint                   NOT NULL,
  "usage_total_quad_tokens"           bigint                   NOT NULL,
  "usage_text_quad_tokens"            bigint                   NOT NULL,
  "usage_rerank_quad_tokens"          bigint                   NOT NULL,
  "usage_embedding_quad_tokens"       bigint                   NOT NULL,
  "usage_moderation_quad_tokens"      bigint                   NOT NULL,
  "usage_ocr_quad_tokens"             bigint                   NOT NULL,
  "usage_image_megapixels"            numeric                  NOT NULL,
  "usage_audio_seconds"               numeric                  NOT NULL,
  "usage_video_pixel_seconds"         numeric                  NOT NULL,
  "usage_input_characters"            bigint                   NOT NULL,
  "usage_output_characters"           bigint                   NOT NULL,
  "usage_total_characters"            bigint                   NOT NULL,
  "usage_normalized_at"               timestamp with time zone,
  "detail_metadata"                   jsonb,
  "usage_video_seconds"               numeric                  NOT NULL,
  "usage_embedding_tokens"            bigint                   NOT NULL,
  "api_model_id"                      text,
  "pricing_plan"                      text,
  "is_free_variant"                   boolean                  NOT NULL,
  "realtime_session_id"               text,
  "provider_ttft_ms"                  integer,
  "gateway_ttft_ms"                   integer,
  "output_speed_tps"                  numeric(30,12),
  "tpot_ms"                           numeric(30,12),
  "itl_ms"                            numeric(30,12),
  "phaseo_overhead_ms"                integer,
  "client_source_id"                  text                     GENERATED ALWAYS AS (NULLIF((detail_metadata #>> '{client_source,id}'::text[]), ''::text)) STORED,
  "client_source_name"                text                     GENERATED ALWAYS AS (NULLIF((detail_metadata #>> '{client_source,name}'::text[]), ''::text)) STORED,
  "client_source_kind"                text                     GENERATED ALWAYS AS (NULLIF((detail_metadata #>> '{client_source,kind}'::text[]), ''::text)) STORED,
  "client_source_version"             text                     GENERATED ALWAYS AS (NULLIF((detail_metadata #>> '{client_source,version}'::text[]), ''::text)) STORED,
  "client_source_detection"           text                     GENERATED ALWAYS AS (NULLIF((detail_metadata #>> '{client_source,detection}'::text[]), ''::text)) STORED,
  "attributed_user_id"                uuid,
  "attributed_access_role"            text,
  "attributed_department_id"          uuid,
  "attributed_department_name"        text,
  "attributed_department_color"       text,
  "attribution_basis"                 text
) PARTITION BY RANGE (created_at);

ALTER TABLE "public"."gateway_requests"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "auth_method" SET DEFAULT 'api_key'::text;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "byok" SET DEFAULT false;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "created_at" SET DEFAULT now();

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "is_free_variant" SET DEFAULT false;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "pricing_lines" SET DEFAULT '[]'::jsonb;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "provider_attempts" SET DEFAULT '[]'::jsonb;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "stream" SET DEFAULT false;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "success" SET DEFAULT false;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_audio_inputs" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_audio_outputs" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_audio_seconds" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_read_audio_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_read_image_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_read_text_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_read_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_read_video_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_write_audio_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_write_image_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_write_text_tokens_1h" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_write_text_tokens_5m" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_write_text_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_write_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_cached_write_video_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_embedding_quad_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_embedding_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_image_inputs" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_image_megapixels" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_image_outputs" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_input_audio_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_input_characters" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_input_image_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_input_quad_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_input_text_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_input_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_input_video_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_moderation_quad_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_ocr_quad_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_output_audio_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_output_characters" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_output_image_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_output_quad_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_output_text_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_output_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_output_video_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_reasoning_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_rerank_quad_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_text_quad_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_total_characters" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_total_quad_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_total_tokens" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_video_inputs" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_video_outputs" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_video_pixel_seconds" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage_video_seconds" SET DEFAULT 0;

ALTER TABLE "public"."gateway_requests"
  ALTER COLUMN "usage" SET DEFAULT '{}'::jsonb;

ALTER TABLE "public"."gateway_requests"
  ADD CONSTRAINT "gateway_requests_app_id_fkey" FOREIGN KEY (app_id) REFERENCES public.api_apps(id) ON DELETE SET NULL;

ALTER TABLE "public"."gateway_requests"
  ADD CONSTRAINT "gateway_requests_auth_method_check" CHECK ((auth_method = ANY (ARRAY['api_key'::text, 'oauth'::text])));

ALTER TABLE "public"."gateway_requests"
  ADD CONSTRAINT "gateway_requests_auth_method_ck" CHECK ((auth_method = ANY (ARRAY['api_key'::text, 'oauth'::text])));

ALTER TABLE "public"."gateway_requests"
  ADD CONSTRAINT "gateway_requests_client_source_contract_check"
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

ALTER TABLE "public"."gateway_requests"
  ADD CONSTRAINT "gateway_requests_model_id_present_ck" CHECK ((NULLIF(btrim(model_id), ''::text) IS NOT NULL));

ALTER TABLE "public"."gateway_requests"
  ADD CONSTRAINT "gateway_requests_performance_metrics_nonnegative"
    CHECK
    ((((provider_ttft_ms IS NULL) OR (provider_ttft_ms >= 0)) AND ((gateway_ttft_ms IS NULL) OR (gateway_ttft_ms >= 0)) AND ((output_speed_tps IS NULL) OR (output_speed_tps >=
    (0)::numeric)) AND ((tpot_ms IS NULL) OR (tpot_ms >= (0)::numeric)) AND ((itl_ms IS NULL) OR (itl_ms >= (0)::numeric)) AND
    ((phaseo_overhead_ms IS NULL) OR (phaseo_overhead_ms >= 0))));

ALTER TABLE "public"."gateway_requests"
  ADD CONSTRAINT "gateway_requests_pkey" PRIMARY KEY (id, created_at);

ALTER TABLE "public"."gateway_requests"
  ADD CONSTRAINT "gateway_requests_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE SET NULL;

ALTER TABLE "public"."gateway_requests"
  ADD CONSTRAINT "gateway_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX gateway_requests_auth_method_idx ON ONLY public.gateway_requests USING btree (auth_method)
  WHERE (auth_method = 'oauth'::text);

CREATE INDEX gateway_requests_finish_reason_created_idx ON ONLY public.gateway_requests USING btree (finish_reason, created_at DESC)
  WHERE (finish_reason IS NOT NULL);

CREATE INDEX gateway_requests_key_id_idx ON ONLY public.gateway_requests USING btree (key_id)
  WHERE (key_id IS NOT NULL);

CREATE INDEX gateway_requests_model_created_provider_idx ON ONLY public.gateway_requests USING btree (model_id, created_at DESC, PROVIDER)
  WHERE (model_id IS NOT NULL);

CREATE INDEX gateway_requests_oauth_client_idx ON ONLY public.gateway_requests USING btree (oauth_client_id)
  WHERE (oauth_client_id IS NOT NULL);

CREATE INDEX gateway_requests_oauth_user_idx ON ONLY public.gateway_requests USING btree (oauth_user_id)
  WHERE (oauth_user_id IS NOT NULL);

CREATE INDEX gateway_requests_provider_model_created_idx ON ONLY public.gateway_requests USING btree (PROVIDER, model_id, created_at DESC)
  WHERE ((PROVIDER IS NOT NULL) AND (model_id IS NOT NULL));

CREATE UNIQUE INDEX gateway_requests_realtime_session_id_key ON ONLY public.gateway_requests USING btree (realtime_session_id, created_at);

CREATE INDEX gateway_requests_success_key_cost_idx ON ONLY public.gateway_requests USING btree (key_id, created_at) INCLUDE (cost_nanos)
  WHERE ((success IS TRUE) AND (key_id IS NOT NULL));

CREATE INDEX gateway_requests_success_key_workspace_cost_idx ON ONLY public.gateway_requests USING btree (key_id, workspace_id, created_at) INCLUDE (cost_nanos)
  WHERE ((success IS TRUE) AND (key_id IS NOT NULL));

CREATE INDEX gateway_requests_success_workspace_cost_idx ON ONLY public.gateway_requests USING btree (workspace_id, created_at) INCLUDE (cost_nanos)
  WHERE (success IS TRUE);

CREATE INDEX gateway_requests_workspace_auth_method_created_idx ON ONLY public.gateway_requests USING btree (workspace_id, auth_method, created_at DESC);

CREATE INDEX gateway_requests_workspace_client_source_time_idx ON ONLY public.gateway_requests USING btree (workspace_id, client_source_id, created_at DESC)
  WHERE (client_source_id IS NOT NULL);

CREATE INDEX gateway_requests_workspace_cursor_idx ON ONLY public.gateway_requests USING btree (workspace_id, created_at DESC, id DESC);

CREATE INDEX gateway_requests_workspace_end_user_created_idx ON ONLY public.gateway_requests USING btree (workspace_id, end_user_id, created_at DESC)
  WHERE (end_user_id IS NOT NULL);

CREATE INDEX gateway_requests_workspace_model_created_idx ON ONLY public.gateway_requests USING btree (workspace_id, model_id, created_at DESC)
  WHERE (model_id IS NOT NULL);

CREATE INDEX gateway_requests_workspace_oauth_client_created_idx ON ONLY public.gateway_requests USING btree (workspace_id, oauth_client_id, created_at DESC)
  WHERE (oauth_client_id IS NOT NULL);

CREATE INDEX gateway_requests_workspace_provider_created_idx ON ONLY public.gateway_requests USING btree (workspace_id, PROVIDER, created_at DESC)
  WHERE (PROVIDER IS NOT NULL);

CREATE INDEX gateway_requests_workspace_request_created_idx ON ONLY public.gateway_requests USING btree (workspace_id, request_id, created_at DESC);

CREATE INDEX gateway_requests_workspace_session_created_idx ON ONLY public.gateway_requests USING btree (workspace_id, session_id, created_at DESC)
  WHERE (session_id IS NOT NULL);

CREATE INDEX idx_gateway_requests_app_created ON ONLY public.gateway_requests USING btree (app_id, created_at)
  WHERE (app_id IS NOT NULL);

CREATE INDEX idx_gateway_requests_finish_reason ON ONLY public.gateway_requests USING btree (workspace_id, finish_reason, created_at DESC);

CREATE INDEX idx_gateway_requests_free_router_recent ON ONLY public.gateway_requests USING btree (created_at DESC, routed_model_id) INCLUDE (cost_nanos)
  WHERE (requested_model_id = 'phaseo/free'::text);

CREATE INDEX idx_gateway_requests_provider_created ON ONLY public.gateway_requests USING btree (PROVIDER, created_at)
  WHERE (PROVIDER IS NOT NULL);

CREATE INDEX idx_gateway_requests_success_created ON ONLY public.gateway_requests USING btree (success, created_at);

CREATE INDEX idx_gateway_requests_workspace_requested_model_created ON ONLY public.gateway_requests USING btree (workspace_id, requested_model_id, created_at DESC)
  WHERE (requested_model_id IS NOT NULL);

CREATE INDEX idx_gateway_requests_workspace_routed_model_created ON ONLY public.gateway_requests USING btree (workspace_id, routed_model_id, created_at DESC)
  WHERE (routed_model_id IS NOT NULL);

CREATE INDEX idx_gateway_requests_workspace_success_created ON ONLY public.gateway_requests USING btree (workspace_id, success, created_at)
  WHERE (success = true);

CREATE TABLE "public"."gateway_requests_2026_03" PARTITION OF "public"."gateway_requests" FOR VALUES FROM ('2026-03-01 00:00:00+00') TO ('2026-04-01 00:00:00+00');

ALTER TABLE "public"."gateway_requests_2026_03"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_requests_2026_04" PARTITION OF "public"."gateway_requests" FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');

ALTER TABLE "public"."gateway_requests_2026_04"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_requests_2026_05" PARTITION OF "public"."gateway_requests" FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');

ALTER TABLE "public"."gateway_requests_2026_05"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_requests_2026_06" PARTITION OF "public"."gateway_requests" FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');

ALTER TABLE "public"."gateway_requests_2026_06"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_requests_2026_07" PARTITION OF "public"."gateway_requests" FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');

ALTER TABLE "public"."gateway_requests_2026_07"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_requests_2026_08" PARTITION OF "public"."gateway_requests" FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');

ALTER TABLE "public"."gateway_requests_2026_08"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_requests_2026_09" PARTITION OF "public"."gateway_requests" FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

ALTER TABLE "public"."gateway_requests_2026_09"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_requests_2026_10" PARTITION OF "public"."gateway_requests" FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');

ALTER TABLE "public"."gateway_requests_2026_10"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."gateway_requests_default" PARTITION OF "public"."gateway_requests" DEFAULT;

ALTER TABLE "public"."gateway_requests_default"
  ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER gateway_requests_public_reporting_refresh
  AFTER UPDATE OF api_model_id, pricing_plan, is_free_variant ON public.gateway_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.enqueue_public_reporting_for_request();

CREATE TRIGGER gateway_requests_snapshot_entitlement
  BEFORE INSERT ON public.gateway_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.snapshot_gateway_request_entitlement();

CREATE TRIGGER materialize_free_admission_usage
  AFTER INSERT ON public.gateway_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.materialize_free_admission_usage();

CREATE TRIGGER normalize_gateway_request_embedding_tokens_trigger
  BEFORE INSERT OR UPDATE OF USAGE ON public.gateway_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_gateway_request_embedding_tokens();

CREATE TRIGGER normalize_gateway_request_video_seconds_trigger
  BEFORE INSERT OR UPDATE OF USAGE ON public.gateway_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_gateway_request_video_seconds();

CREATE TRIGGER trg_gateway_requests_attach_chat_app_id
  BEFORE INSERT OR UPDATE OF workspace_id, key_id, app_id ON public.gateway_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.gateway_requests_attach_chat_app_id();

CREATE TRIGGER trg_gateway_requests_normalize_usage
  BEFORE INSERT OR UPDATE OF USAGE ON public.gateway_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_gateway_request_usage();

CREATE POLICY "gateway_requests_insert_service" ON "public"."gateway_requests"
  FOR INSERT
  TO "service_role"
  WITH CHECK (true);

CREATE POLICY "gateway_requests_select_own_team" ON "public"."gateway_requests"
  FOR SELECT
  TO "authenticated"
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "service_role_full_access" ON "public"."gateway_requests_2026_03"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON "public"."gateway_requests_2026_04"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON "public"."gateway_requests_2026_05"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON "public"."gateway_requests_2026_06"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON "public"."gateway_requests_2026_07"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON "public"."gateway_requests_2026_08"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "deny_direct_client_access" ON "public"."gateway_requests_2026_09"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "service_role_full_access" ON "public"."gateway_requests_2026_09"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "deny_direct_client_access" ON "public"."gateway_requests_2026_10"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

CREATE POLICY "service_role_full_access" ON "public"."gateway_requests_default"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_requests" TO "anon", "authenticated", "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_requests_2026_03" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_requests_2026_04" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_requests_2026_05" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_requests_2026_06" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_requests_2026_07" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_requests_2026_08" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_requests_2026_09" TO "service_role";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_requests_default" TO "service_role";

COMMENT ON COLUMN "public"."gateway_requests"."api_model_id" IS 'Concrete provider API model id executed for this request, preserving variants such as :free, -fast, or -flex.';

COMMENT ON COLUMN "public"."gateway_requests"."auth_method" IS 'Authentication method used for the request: api_key (legacy HMAC keys) or oauth (JWT tokens)';

COMMENT ON COLUMN "public"."gateway_requests"."detail_metadata" IS 'Request-level routing, provider, guardrail, and plugin diagnostics for observability detail views.';

COMMENT ON COLUMN "public"."gateway_requests"."end_user_id" IS 'Caller-supplied user identifier for trace/session analytics (for example request.user).';

COMMENT ON COLUMN "public"."gateway_requests"."error_payload" IS 'Sanitized structured gateway error payload captured for failed requests, used by request/session/job investigation surfaces.';

COMMENT ON COLUMN "public"."gateway_requests"."finish_reason" IS 'Normalized finish reason across all providers (e.g., stop, length, tool_calls, content_filter, error)';

COMMENT ON COLUMN "public"."gateway_requests"."is_free_variant" IS 'True when the executed request used a free model or free pricing plan.';

COMMENT ON COLUMN "public"."gateway_requests"."itl_ms" IS 'Mean observed interval in milliseconds between successive content-bearing provider stream frames.';

COMMENT ON COLUMN "public"."gateway_requests"."oauth_client_id" IS 'OAuth client ID if auth_method is oauth';

COMMENT ON COLUMN "public"."gateway_requests"."oauth_user_id" IS 'User ID who authorized the OAuth app (from JWT claims)';

COMMENT ON COLUMN "public"."gateway_requests"."pricing_plan" IS 'Pricing plan selected by the gateway pricing engine for this request, such as standard, free, priority, flex, or batch.';

COMMENT ON COLUMN "public"."gateway_requests"."provider_attempts" IS 'Gateway-captured provider routing attempts for this request, including failures, statuses, durations, and upstream error summaries.';

COMMENT ON COLUMN "public"."gateway_requests"."requested_model_id" IS 'Original model id requested by the client before any routing or router expansion.';

COMMENT ON COLUMN "public"."gateway_requests"."routed_model_id" IS 'Concrete routed model id chosen for execution. For non-router requests this typically matches the requested model.';

COMMENT ON COLUMN "public"."gateway_requests"."session_id" IS 'Caller-supplied session identifier for grouping related requests.';

COMMENT ON COLUMN "public"."gateway_requests"."trace_data" IS 'Arbitrary caller-supplied trace key-value metadata for observability.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_audio_seconds" IS 'Provider-independent audio workload in seconds.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_embedding_tokens" IS 'Native embedding endpoint token count from provider usage metadata.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_image_inputs" IS 'Normalized per-request count of image inputs when providers expose a count.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_image_megapixels" IS 'Provider-independent image workload in megapixels when dimensions are known.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_image_outputs" IS 'Normalized per-request count of image outputs when providers expose a count.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_input_image_tokens" IS 'Normalized per-request image input tokens.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_input_quad_tokens" IS 'Provider-independent input quadtokens, calculated as ceil(input text characters / 4).';

COMMENT ON COLUMN "public"."gateway_requests"."usage_input_tokens" IS 'Normalized per-request input tokens across modalities.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_output_image_tokens" IS 'Normalized per-request image output tokens.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_output_quad_tokens" IS 'Provider-independent output quadtokens, calculated as ceil(output text characters / 4).';

COMMENT ON COLUMN "public"."gateway_requests"."usage_output_tokens" IS 'Normalized per-request output tokens across modalities.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_reasoning_tokens" IS 'Normalized per-request reasoning/thinking tokens.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_text_quad_tokens" IS 'Provider-independent text-like workload quadtokens across text, rerank, embeddings, moderation, and OCR text.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_total_tokens" IS 'Normalized per-request total tokens derived from usage JSON at write time.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_video_pixel_seconds" IS 'Provider-independent video workload in pixel-seconds when dimensions and duration are known.';

COMMENT ON COLUMN "public"."gateway_requests"."usage_video_seconds" IS 'Normalized generated/processed video seconds derived from gateway usage metadata or request duration.';

COMMENT ON TABLE "public"."gateway_requests" IS 'Authoritative partitioned gateway request log. V2 observability tables extend this record; they do not replace it.';

REVOKE ALL ON TABLE "public"."gateway_requests_2026_03" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."gateway_requests_2026_04" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."gateway_requests_2026_05" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."gateway_requests_2026_06" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."gateway_requests_2026_07" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."gateway_requests_2026_08" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."gateway_requests_2026_09" FROM "anon", "authenticated";

REVOKE ALL ON TABLE "public"."gateway_requests_2026_10" FROM "anon", "authenticated", "service_role";

REVOKE ALL ON TABLE "public"."gateway_requests_default" FROM "anon", "authenticated";

CREATE TABLE "public"."v2_public_provider_health_daily" (
  "usage_date"               date                     NOT NULL,
  "model_slug"               text                     NOT NULL,
  "provider_model_id"        text                     NOT NULL,
  "provider_slug"            text                     NOT NULL,
  "request_count"            bigint                   NOT NULL DEFAULT 0,
  "successful_request_count" bigint                   NOT NULL DEFAULT 0,
  "attempt_count"            bigint                   NOT NULL DEFAULT 0,
  "successful_attempts"      bigint                   NOT NULL DEFAULT 0,
  "failed_attempts"          bigint                   NOT NULL DEFAULT 0,
  "fallback_attempts"        bigint                   NOT NULL DEFAULT 0,
  "latency_sum_ms"           bigint                   NOT NULL DEFAULT 0,
  "latency_count"            bigint                   NOT NULL DEFAULT 0,
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_public_provider_health_daily_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE,
  CONSTRAINT "v2_public_provider_health_daily_pkey" PRIMARY KEY (usage_date, model_slug, provider_slug, provider_model_id)
);

ALTER TABLE "public"."v2_public_provider_health_daily"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_public_provider_health_model_idx ON public.v2_public_provider_health_daily USING btree (model_slug, usage_date DESC, provider_slug);

CREATE POLICY "v2_public_provider_health_daily_public_select" ON "public"."v2_public_provider_health_daily"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."v2_public_provider_health_daily" TO "anon", "authenticated", "service_role";

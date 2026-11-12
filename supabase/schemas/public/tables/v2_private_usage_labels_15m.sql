CREATE TABLE "public"."v2_private_usage_labels_15m" (
  "workspace_id"        uuid                     NOT NULL,
  "bucket_start"        timestamp with time zone NOT NULL,
  "label_key"           text                     NOT NULL,
  "label_value"         text                     NOT NULL,
  "model_id"            text,
  "provider_model_id"   text,
  "key_id"              uuid,
  "app_id"              uuid,
  "byok"                boolean                  NOT NULL DEFAULT false,
  "requests"            bigint                   NOT NULL DEFAULT 0,
  "successful_requests" bigint                   NOT NULL DEFAULT 0,
  "guardrail_blocked"   bigint                   NOT NULL DEFAULT 0,
  "cost_nanos"          numeric(30,0)            NOT NULL DEFAULT 0,
  "tokens"              numeric(30,12)           NOT NULL DEFAULT 0,
  "input_tokens"        numeric(30,12)           NOT NULL DEFAULT 0,
  "output_tokens"       numeric(30,12)           NOT NULL DEFAULT 0,
  "reasoning_tokens"    numeric(30,12)           NOT NULL DEFAULT 0,
  "cached_tokens"       numeric(30,12)           NOT NULL DEFAULT 0,
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_private_usage_labels_15m_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES private.usage_workspace_identity(workspace_id) ON DELETE RESTRICT
);

ALTER TABLE "public"."v2_private_usage_labels_15m"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX v2_private_usage_labels_15m_key ON public.v2_private_usage_labels_15m
  USING btree
  (workspace_id, label_key, label_value, bucket_start, model_id, provider_model_id, key_id, app_id, byok) NULLS NOT DISTINCT;

CREATE INDEX v2_private_usage_labels_15m_workspace_time_idx ON public.v2_private_usage_labels_15m USING btree (workspace_id, bucket_start);

REVOKE ALL ON TABLE "public"."v2_private_usage_labels_15m" FROM "service_role";

GRANT SELECT ON TABLE "public"."v2_private_usage_labels_15m" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_private_usage_labels_15m" FROM "anon", "authenticated";

COMMENT ON TABLE "public"."v2_private_usage_labels_15m" IS 'Exact workspace usage per 15 minutes and request label, by model, route, key, app and BYOK, for the usage overview''s label filter and label list. A request counts once under each of its labels. Rebuilt per workspace hour by process_v2_analytics_outbox alongside v2_private_usage_15m. Service role only: the account routes check workspace membership.';

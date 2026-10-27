CREATE TABLE "public"."v2_private_usage_15m" (
  "workspace_id"       uuid                     NOT NULL,
  "bucket_start"       timestamp with time zone NOT NULL,
  "model_id"           text,
  "provider_model_id"  text,
  "key_id"             uuid,
  "app_id"             uuid,
  "byok"               boolean                  NOT NULL DEFAULT false,
  "requests"           bigint                   NOT NULL DEFAULT 0,
  "successful_requests" bigint                   NOT NULL DEFAULT 0,
  "guardrail_blocked"  bigint                   NOT NULL DEFAULT 0,
  "cost_nanos"         numeric(30,0)            NOT NULL DEFAULT 0,
  "tokens"             numeric(30,12)           NOT NULL DEFAULT 0,
  "input_tokens"       numeric(30,12)           NOT NULL DEFAULT 0,
  "output_tokens"      numeric(30,12)           NOT NULL DEFAULT 0,
  "reasoning_tokens"   numeric(30,12)           NOT NULL DEFAULT 0,
  "cached_tokens"      numeric(30,12)           NOT NULL DEFAULT 0,
  "updated_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "actor_user_id"      uuid,
  CONSTRAINT "v2_private_usage_15m_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES private.usage_workspace_identity(workspace_id) ON DELETE RESTRICT
);

ALTER TABLE "public"."v2_private_usage_15m"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX v2_private_usage_15m_key ON public.v2_private_usage_15m
  USING btree
  (workspace_id, bucket_start, model_id, provider_model_id, key_id, app_id, byok, actor_user_id) NULLS NOT DISTINCT;

REVOKE ALL ON TABLE "public"."v2_private_usage_15m" FROM "service_role";

GRANT SELECT ON TABLE "public"."v2_private_usage_15m" TO "service_role";

REVOKE ALL ON TABLE "public"."v2_private_usage_15m" FROM "anon", "authenticated";

COMMENT ON COLUMN "public"."v2_private_usage_15m"."actor_user_id" IS 'Who made the requests, as v2_usage_overview_requests resolves it: the OAuth user for OAuth tokens, otherwise the key''s OAuth user or creator. Null when unknown. Rows from before this column existed were backfilled from keys for the current and previous calendar month only; older rows have no actor until their hour is rebuilt.';

COMMENT ON TABLE "public"."v2_private_usage_15m" IS 'Exact workspace usage per 15 minutes for the usage overview and spend rules, by model, route, key, app, BYOK and actor. Rebuilt per workspace hour by process_v2_analytics_outbox. Excludes async job endpoints, as the overview does. Service role only: the account route checks workspace membership.';

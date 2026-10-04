CREATE TABLE "private"."v2_analytics_previous_grains" (
  "grain_id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"      uuid                     NOT NULL,
  "occurred_at"       timestamp with time zone NOT NULL,
  "app_id"            uuid,
  "model_slug"        text,
  "provider_model_id" text,
  "cloudflare_colo"   text,
  "queued_at"         timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "transaction_id"    bigint                   NOT NULL DEFAULT txid_current(),
  CONSTRAINT "v2_analytics_previous_grains_pkey" PRIMARY KEY (grain_id)
);

ALTER TABLE "private"."v2_analytics_previous_grains"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX v2_analytics_previous_grains_identity_idx ON private.v2_analytics_previous_grains
  USING btree (workspace_id, occurred_at, app_id, model_slug, provider_model_id, cloudflare_colo) NULLS NOT DISTINCT;

CREATE INDEX v2_analytics_previous_grains_oldest_idx ON private.v2_analytics_previous_grains USING btree (queued_at, grain_id);

COMMENT ON TABLE "private"."v2_analytics_previous_grains" IS 'Former UTC-hour identities coalesced by nullable dimensions; share the configured V2 worker batch cap, with five reserved repair slots and exact-generation acknowledgment. Retention pruning queues no repairs.';

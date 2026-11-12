-- Provider rate limits can apply to one upstream model as well as across a provider.
-- '*' keeps the existing provider-wide meaning, so existing rows are unchanged.
ALTER TABLE "public"."provider_rate_limits"
  ADD COLUMN "provider_model_slug" text NOT NULL DEFAULT '*'::text;

ALTER TABLE "public"."provider_rate_limits"
  ADD CONSTRAINT "provider_rate_limits_provider_model_slug_not_blank" CHECK ((btrim(provider_model_slug) <> ''::text));

ALTER TABLE "public"."provider_rate_limits"
  DROP CONSTRAINT "provider_rate_limits_pkey";

ALTER TABLE "public"."provider_rate_limits"
  ADD CONSTRAINT "provider_rate_limits_pkey" PRIMARY KEY (provider_id, provider_model_slug);

COMMENT ON COLUMN "public"."provider_rate_limits"."provider_model_slug" IS 'Upstream model id (v2_model_provider_routes.provider_model_slug) the limit applies to; ''*'' applies it across all of the provider''s models.';

COMMENT ON TABLE "public"."provider_rate_limits" IS 'Gateway-managed upstream provider capacity limits, counted globally across all users. A provider and model that reaches a limit is heavily deranked in routing rather than excluded.';

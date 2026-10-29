-- Slack agent: choosing a model per message. Admins switch it on and list the
-- models people may name with "with <model>:"; the installation's model stays
-- the default. web-api checks each id against the catalogue.

ALTER TABLE "public"."slack_installations"
  ADD COLUMN "model_choice_enabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "public"."slack_installations"
  ADD COLUMN "allowed_models" text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE "public"."slack_installations"
  ADD CONSTRAINT "slack_installations_allowed_models_check" CHECK ((cardinality(allowed_models) <= 10));

COMMENT ON COLUMN "public"."slack_installations"."model_choice_enabled" IS 'Whether people may choose the model for one message by starting it with "with <model>:", from allowed_models. Off by default.';

COMMENT ON COLUMN "public"."slack_installations"."allowed_models" IS 'The models people may choose per message (up to 10 v2_models.model_slug values, or phaseo/auto where the workspace has Auto Routing). web-api checks each one; model stays the default.';

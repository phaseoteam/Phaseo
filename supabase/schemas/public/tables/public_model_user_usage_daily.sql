CREATE TABLE "public"."public_model_user_usage_daily" (
  "day_bucket"   date                     NOT NULL,
  "model_id"     text                     NOT NULL,
  "provider_id"  text                     NOT NULL,
  "actor_hash"   text                     NOT NULL,
  "requests"     bigint                   NOT NULL DEFAULT 0,
  "tokens"       bigint                   NOT NULL DEFAULT 0,
  "refreshed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "public_model_user_usage_daily_pkey" PRIMARY KEY (day_bucket, model_id, provider_id, actor_hash)
);

ALTER TABLE "public"."public_model_user_usage_daily"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX public_model_user_usage_daily_day_idx ON public.public_model_user_usage_daily USING btree (day_bucket DESC);

CREATE INDEX public_model_user_usage_daily_model_day_idx ON public.public_model_user_usage_daily USING btree (model_id, day_bucket DESC);

CREATE POLICY "service_role_full_access" ON "public"."public_model_user_usage_daily"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."public_model_user_usage_daily" TO "service_role";

COMMENT ON TABLE "public"."public_model_user_usage_daily" IS 'Daily privacy-safe actor rollup for public model unique-user leaderboards.';

REVOKE ALL ON TABLE "public"."public_model_user_usage_daily" FROM "anon", "authenticated";

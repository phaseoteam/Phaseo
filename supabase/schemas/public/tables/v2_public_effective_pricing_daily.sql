CREATE TABLE "public"."v2_public_effective_pricing_daily" (
  "model_slug"          text                     NOT NULL,
  "usage_date"          date                     NOT NULL,
  "provider_id"         text                     NOT NULL,
  "pricing_plan"        text                     NOT NULL DEFAULT 'standard'::text,
  "input_tokens"        numeric(30,12)           NOT NULL DEFAULT 0,
  "output_tokens"       numeric(30,12)           NOT NULL DEFAULT 0,
  "cached_read_tokens"  numeric(30,12)           NOT NULL DEFAULT 0,
  "cached_write_tokens" numeric(30,12)           NOT NULL DEFAULT 0,
  "input_cost_nanos"    numeric(30,12)           NOT NULL DEFAULT 0,
  "output_cost_nanos"   numeric(30,12)           NOT NULL DEFAULT 0,
  "total_cost_nanos"    numeric(30,12)           NOT NULL DEFAULT 0,
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_public_effective_pricing_daily_model_slug_fkey" FOREIGN KEY (model_slug) REFERENCES public.v2_models(model_slug) ON DELETE CASCADE,
  CONSTRAINT "v2_public_effective_pricing_daily_nonnegative"
    CHECK
    (((input_tokens >= (0)::numeric) AND (output_tokens >= (0)::numeric) AND (cached_read_tokens >= (0)::numeric) AND (cached_write_tokens >= (0)::numeric) AND (input_cost_nanos >=
    (0)::numeric) AND (output_cost_nanos >= (0)::numeric) AND (total_cost_nanos >= (0)::numeric))),
  CONSTRAINT "v2_public_effective_pricing_daily_pkey" PRIMARY KEY (model_slug, usage_date, provider_id, pricing_plan)
);

ALTER TABLE "public"."v2_public_effective_pricing_daily"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX v2_public_effective_pricing_daily_date_idx ON public.v2_public_effective_pricing_daily USING btree (usage_date DESC, model_slug);

CREATE POLICY "v2_public_effective_pricing_daily_select" ON "public"."v2_public_effective_pricing_daily"
  FOR SELECT
  TO "anon", "authenticated"
  USING (true);

COMMENT ON TABLE "public"."v2_public_effective_pricing_daily" IS 'Public daily model pricing aggregates from charged request lines, separated by authoritative provider service tier.';

REVOKE ALL ON TABLE "public"."v2_public_effective_pricing_daily" FROM "anon";

GRANT SELECT ON TABLE "public"."v2_public_effective_pricing_daily" TO "anon";

REVOKE ALL ON TABLE "public"."v2_public_effective_pricing_daily" FROM "authenticated";

GRANT SELECT ON TABLE "public"."v2_public_effective_pricing_daily" TO "authenticated";

REVOKE ALL ON TABLE "public"."v2_public_effective_pricing_daily" FROM "service_role";

GRANT SELECT ON TABLE "public"."v2_public_effective_pricing_daily" TO "service_role";

create policy public_pricing_model_visibility on public.v2_public_effective_pricing_daily as restrictive
for select to anon, authenticated using (public.public_reporting_route_is_visible(model_slug, null, provider_id));

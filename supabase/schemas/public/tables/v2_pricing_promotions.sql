CREATE TABLE "public"."v2_pricing_promotions" (
  "promotion_id"  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "label"         text                     NOT NULL,
  "sku_ids"       uuid[]                   NOT NULL,
  "discount_bps"  integer                  NOT NULL,
  "budget_nanos"  bigint                   NOT NULL,
  "starts_at"     timestamp with time zone NOT NULL,
  "ends_at"       timestamp with time zone NOT NULL,
  "spent_nanos"   bigint                   NOT NULL DEFAULT 0,
  "checked_at"    timestamp with time zone,
  "exhausted_at"  timestamp with time zone,
  "metadata"      jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "v2_pricing_promotions_budget_nanos_check" CHECK ((budget_nanos > 0)),
  CONSTRAINT "v2_pricing_promotions_discount_bps_check" CHECK (((discount_bps > 0) AND (discount_bps < 10000))),
  CONSTRAINT "v2_pricing_promotions_sku_ids_check" CHECK ((cardinality(sku_ids) > 0)),
  CONSTRAINT "v2_pricing_promotions_window_check" CHECK ((ends_at > starts_at)),
  CONSTRAINT "v2_pricing_promotions_pkey" PRIMARY KEY (promotion_id)
);

ALTER TABLE "public"."v2_pricing_promotions"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON "public"."v2_pricing_promotions"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE "public"."v2_pricing_promotions" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."v2_pricing_promotions" TO "service_role";

COMMENT ON TABLE "public"."v2_pricing_promotions" IS 'Budget caps for promotional SKUs. budget_nanos and spent_nanos are list-price (undiscounted) value; enforce_pricing_promotion_budgets() ends the SKUs once spent_nanos reaches budget_nanos.';

REVOKE ALL ON TABLE "public"."v2_pricing_promotions" FROM "anon", "authenticated";

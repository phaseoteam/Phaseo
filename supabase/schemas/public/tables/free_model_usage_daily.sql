CREATE TABLE "public"."free_model_usage_daily" (
  "owner_id"          uuid                     NOT NULL,
  "usage_date"        date                     NOT NULL,
  "included_requests" integer                  NOT NULL,
  "overage_requests"  integer                  NOT NULL DEFAULT 0,
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "free_model_usage_daily_included_requests_check" CHECK (((included_requests >= 1) AND (included_requests <= 1500))),
  CONSTRAINT "free_model_usage_daily_overage_requests_check" CHECK ((overage_requests = 0)),
  CONSTRAINT "free_model_usage_daily_pkey" PRIMARY KEY (owner_id, usage_date)
);

ALTER TABLE "public"."free_model_usage_daily"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."free_model_usage_daily" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."free_model_usage_daily" TO "service_role";

REVOKE ALL ON TABLE "public"."free_model_usage_daily" FROM "anon", "authenticated";

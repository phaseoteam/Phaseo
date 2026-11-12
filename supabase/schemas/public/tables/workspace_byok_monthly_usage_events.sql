CREATE TABLE "public"."workspace_byok_monthly_usage_events" (
  "workspace_id"    uuid                     NOT NULL,
  "month_start"     timestamp with time zone NOT NULL,
  "idempotency_key" text                     NOT NULL,
  "request_count"   bigint                   NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "workspace_byok_monthly_usage_events_pkey" PRIMARY KEY (workspace_id, month_start, idempotency_key),
  CONSTRAINT "workspace_byok_monthly_usage_events_request_count_check" CHECK ((request_count > 0))
);

ALTER TABLE "public"."workspace_byok_monthly_usage_events"
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."workspace_byok_monthly_usage_events" FROM "anon", "authenticated", "service_role";

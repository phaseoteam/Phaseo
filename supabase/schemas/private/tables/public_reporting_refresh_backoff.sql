CREATE TABLE "private"."public_reporting_refresh_backoff" (
  "report"          text                     NOT NULL,
  "bucket_start"    date                     NOT NULL,
  "retry_after"     timestamp with time zone NOT NULL,
  "last_error_code" text                     NOT NULL,
  CONSTRAINT "public_reporting_refresh_backoff_pkey" PRIMARY KEY (report, bucket_start)
);

ALTER TABLE "private"."public_reporting_refresh_backoff"
  ENABLE ROW LEVEL SECURITY;

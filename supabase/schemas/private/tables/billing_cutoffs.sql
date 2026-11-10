CREATE TABLE "private"."billing_cutoffs" (
  "singleton"          boolean                  NOT NULL DEFAULT true,
  "pending_json_cutoff" timestamp with time zone,
  CONSTRAINT "billing_cutoffs_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "billing_cutoffs_singleton_check" CHECK (singleton)
);

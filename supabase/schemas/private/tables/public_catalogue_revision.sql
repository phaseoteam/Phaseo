CREATE TABLE "private"."public_catalogue_revision" (
  "singleton"       boolean                  NOT NULL DEFAULT true,
  "revision"        bigint                   NOT NULL DEFAULT 0,
  "changed_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "changed_xid"     xid8,
  "pending_since"   timestamp with time zone,
  "purged_revision" bigint                   NOT NULL DEFAULT 0,
  "purged_at"       timestamp with time zone,
  CONSTRAINT "public_catalogue_revision_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "public_catalogue_revision_singleton_check" CHECK (singleton)
);

COMMENT ON TABLE "private"."public_catalogue_revision" IS 'Bumped once per transaction that changes public catalogue content. The web-api cron purges the website caches when revision passes purged_revision.';

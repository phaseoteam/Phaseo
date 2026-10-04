CREATE TABLE "private"."routing_catalogue_revision" (
  "singleton" boolean NOT NULL DEFAULT true,
  "revision"  bigint  NOT NULL DEFAULT 0,
  CONSTRAINT "routing_catalogue_revision_pkey" PRIMARY KEY (singleton),
  CONSTRAINT "routing_catalogue_revision_singleton_check" CHECK (singleton)
);

GRANT SELECT, UPDATE ON TABLE "private"."routing_catalogue_revision" TO "service_role";

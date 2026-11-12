CREATE TABLE "public"."gateway_workspace_publications" (
  "workspace_id" uuid                     NOT NULL,
  "revision"     uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "created_at"   timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "available_at" timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  "attempts"     integer                  NOT NULL DEFAULT 0,
  "lease_id"     uuid,
  "lease_until"  timestamp with time zone,
  CONSTRAINT "gateway_workspace_publications_attempts_check" CHECK (((attempts >= 0) AND (attempts <= 10))),
  CONSTRAINT "gateway_workspace_publications_lease_pair" CHECK (((lease_id IS NULL) = (lease_until IS NULL))),
  CONSTRAINT "gateway_workspace_publications_pkey" PRIMARY KEY (workspace_id),
  CONSTRAINT "gateway_workspace_publications_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."gateway_workspace_publications"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_workspace_publications_due ON public.gateway_workspace_publications USING btree (available_at, workspace_id)
  WHERE (attempts < 10);

COMMENT ON TABLE "public"."gateway_workspace_publications" IS 'One coalesced cache-publication intent per workspace; contains no credentials or customer payloads. Ten failed/abandoned attempts require operator attention or a new mutation.';

REVOKE ALL ON TABLE "public"."gateway_workspace_publications" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."gateway_workspace_publications" TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_workspace_publications" FROM "anon", "authenticated";

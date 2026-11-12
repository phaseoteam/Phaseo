CREATE TABLE "public"."key_storage_incident_keys" (
  "incident_id"     uuid NOT NULL,
  "key_id"          uuid NOT NULL,
  "workspace_id"    uuid NOT NULL,
  "previous_status" text NOT NULL,
  CONSTRAINT "key_storage_incident_keys_pkey" PRIMARY KEY (incident_id, key_id),
  CONSTRAINT "key_storage_incident_keys_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES public.key_storage_incidents(id) ON DELETE CASCADE,
  CONSTRAINT "key_storage_incident_keys_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE CASCADE,
  CONSTRAINT "key_storage_incident_keys_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."key_storage_incident_keys"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX key_storage_incident_keys_key_id_idx ON public.key_storage_incident_keys USING btree (key_id);

CREATE INDEX key_storage_incident_keys_workspace_id_idx ON public.key_storage_incident_keys USING btree (workspace_id, incident_id);

GRANT SELECT, INSERT ON TABLE "public"."key_storage_incident_keys" TO "service_role";

COMMENT ON TABLE "public"."key_storage_incident_keys" IS 'Keys a key storage incident revoked or paused, with their status before. Shows each workspace which of its keys an incident affected. Service-only.';

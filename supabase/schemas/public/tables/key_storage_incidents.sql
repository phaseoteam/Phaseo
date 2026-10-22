CREATE TABLE "public"."key_storage_incidents" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "client_request_id"   uuid                     NOT NULL,
  "location_id"         text                     NOT NULL,
  "action"              text                     NOT NULL,
  "keys_created_before" timestamp with time zone NOT NULL,
  "title"               text                     NOT NULL,
  "customer_message"    text                     NOT NULL,
  "source_url"          text,
  "declared_by"         uuid,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "applied_at"          timestamp with time zone,
  "affected_keys"       integer,
  "affected_workspaces" integer,
  CONSTRAINT "key_storage_incidents_pkey" PRIMARY KEY (id),
  CONSTRAINT "key_storage_incidents_client_request_id_key" UNIQUE (client_request_id),
  CONSTRAINT "key_storage_incidents_action_check" CHECK ((action = ANY (ARRAY['revoke'::text, 'pause'::text]))),
  CONSTRAINT "key_storage_incidents_location_check" CHECK (public.valid_key_storage_locations(ARRAY[location_id])),
  CONSTRAINT "key_storage_incidents_title_check" CHECK (((length(btrim(title)) >= 1) AND (length(title) <= 200))),
  CONSTRAINT "key_storage_incidents_message_check" CHECK (((length(btrim(customer_message)) >= 1) AND (length(customer_message) <= 2000))),
  CONSTRAINT "key_storage_incidents_source_url_check" CHECK (((source_url IS NULL) OR ((source_url ~ '^https://'::text) AND (length(source_url) <= 500)))),
  CONSTRAINT "key_storage_incidents_declared_by_fkey" FOREIGN KEY (declared_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE "public"."key_storage_incidents"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX key_storage_incidents_created_at_idx ON public.key_storage_incidents USING btree (created_at DESC);

CREATE INDEX key_storage_incidents_declared_by_idx ON public.key_storage_incidents USING btree (declared_by)
  WHERE (declared_by IS NOT NULL);

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."key_storage_incidents" TO "service_role";

COMMENT ON TABLE "public"."key_storage_incidents" IS 'A platform where customers store API keys (key storage location) reported a breach. Phaseo staff declare it, then apply it once to revoke or pause every matching key created before keys_created_before, across all workspaces. Service-only.';

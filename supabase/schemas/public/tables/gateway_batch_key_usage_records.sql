CREATE TABLE "public"."gateway_batch_key_usage_records" (
  "workspace_id" uuid                     NOT NULL,
  "batch_id"     text                     NOT NULL,
  "custom_id"    text                     NOT NULL,
  "key_id"       uuid                     NOT NULL,
  "provider"     text,
  "endpoint"     text                     NOT NULL,
  "model"        text                     NOT NULL,
  "cost_nanos"   bigint                   NOT NULL,
  "usage"        jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_batch_key_usage_records_cost_nanos_check" CHECK ((cost_nanos >= 0)),
  CONSTRAINT "gateway_batch_key_usage_records_pkey" PRIMARY KEY (workspace_id, batch_id, custom_id),
  CONSTRAINT "gateway_batch_key_usage_records_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE CASCADE,
  CONSTRAINT "gateway_batch_key_usage_records_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES private.usage_workspace_identity(workspace_id) ON DELETE RESTRICT
);

ALTER TABLE "public"."gateway_batch_key_usage_records"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX gateway_batch_key_usage_records_key_id_idx ON public.gateway_batch_key_usage_records USING btree (key_id);

CREATE POLICY "service_role_full_access" ON "public"."gateway_batch_key_usage_records"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_batch_key_usage_records" TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_batch_key_usage_records" FROM "anon", "authenticated";

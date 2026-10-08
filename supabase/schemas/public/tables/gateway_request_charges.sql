CREATE TABLE "public"."gateway_request_charges" (
  "workspace_id"         uuid                     NOT NULL,
  "request_id"           text                     NOT NULL,
  "cost_nanos"           bigint                   NOT NULL,
  "status"               text                     NOT NULL DEFAULT 'applying'::text,
  "deducted_status"      text,
  "auto_top_up_required" boolean                  NOT NULL DEFAULT false,
  "error_message"        text,
  "created_at"           timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"           timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "gateway_request_charges_cost_nanos_check" CHECK ((cost_nanos > 0)),
  CONSTRAINT "gateway_request_charges_pkey" PRIMARY KEY (workspace_id, request_id),
  CONSTRAINT "gateway_request_charges_status_check" CHECK ((status = ANY (ARRAY['applying'::text, 'applied'::text, 'failed'::text]))),
  CONSTRAINT "gateway_request_charges_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES private.usage_workspace_identity(workspace_id) ON DELETE RESTRICT
);

ALTER TABLE "public"."gateway_request_charges"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_gateway_request_charges_created_at ON public.gateway_request_charges USING btree (created_at DESC);

CREATE POLICY "service_role_full_access" ON "public"."gateway_request_charges"
  FOR ALL
  TO "service_role"
  USING (true)
  WITH CHECK (true);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."gateway_request_charges" TO "service_role";

REVOKE ALL ON TABLE "public"."gateway_request_charges" FROM "anon", "authenticated";

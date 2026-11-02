CREATE TABLE "public"."work_customer_requests" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"   uuid                     NOT NULL,
  "customer_id"    uuid,
  "work_item_id"   uuid,
  "intake_form_id" uuid,
  "source"         text                     NOT NULL DEFAULT 'manual'::text,
  "status"         text                     NOT NULL DEFAULT 'new'::text,
  "contact_name"   text,
  "contact_email"  text,
  "subject"        text,
  "body"           text                     NOT NULL,
  "metadata"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_by"     uuid,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_customer_requests_body_length_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 50000))),
  CONSTRAINT "work_customer_requests_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_customer_requests_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.work_customers(id) ON DELETE SET NULL,
  CONSTRAINT "work_customer_requests_intake_form_id_fkey" FOREIGN KEY (intake_form_id) REFERENCES public.work_intake_forms(id) ON DELETE SET NULL,
  CONSTRAINT "work_customer_requests_metadata_object_check" CHECK ((jsonb_typeof(metadata) = 'object'::text)),
  CONSTRAINT "work_customer_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_customer_requests_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'form'::text, 'email'::text, 'slack'::text, 'api'::text]))),
  CONSTRAINT "work_customer_requests_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'linked'::text, 'dismissed'::text]))),
  CONSTRAINT "work_customer_requests_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE SET NULL,
  CONSTRAINT "work_customer_requests_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_customer_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_customer_requests_created_by_idx ON public.work_customer_requests USING btree (created_by)
  WHERE (created_by IS NOT NULL);

CREATE INDEX work_customer_requests_customer_id_idx ON public.work_customer_requests USING btree (customer_id)
  WHERE (customer_id IS NOT NULL);

CREATE INDEX work_customer_requests_intake_form_id_idx ON public.work_customer_requests USING btree (intake_form_id)
  WHERE (intake_form_id IS NOT NULL);

CREATE INDEX work_customer_requests_work_item_id_idx ON public.work_customer_requests USING btree (work_item_id)
  WHERE (work_item_id IS NOT NULL);

CREATE INDEX work_customer_requests_workspace_status_idx ON public.work_customer_requests USING btree (workspace_id, status, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_customer_requests"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_customer_requests" IS 'Asks and customer feedback, in the customer''s own words, attached to a work item as the record of demand. Private: the body and contact details are never copied into GitHub or sent to an agent that can write outside Phaseo.';

REVOKE ALL ON TABLE "public"."work_customer_requests" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_customer_requests" TO "service_role";

REVOKE ALL ON TABLE "public"."work_customer_requests" FROM "anon", "authenticated";

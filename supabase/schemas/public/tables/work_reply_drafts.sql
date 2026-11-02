CREATE TABLE "public"."work_reply_drafts" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "work_item_id" uuid                     NOT NULL,
  "request_id"   uuid                     NOT NULL,
  "subject"      text                     NOT NULL DEFAULT ''::text,
  "body"         text                     NOT NULL,
  "status"       text                     NOT NULL DEFAULT 'draft'::text,
  "model"        text,
  "cost_nanos"   bigint                   NOT NULL DEFAULT 0,
  "sent_to"      text,
  "sent_by"      uuid,
  "sent_at"      timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_reply_drafts_body_length_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 20000))),
  CONSTRAINT "work_reply_drafts_cost_nanos_check" CHECK ((cost_nanos >= 0)),
  CONSTRAINT "work_reply_drafts_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_reply_drafts_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.work_customer_requests(id) ON DELETE CASCADE,
  CONSTRAINT "work_reply_drafts_sent_by_fkey" FOREIGN KEY (sent_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "work_reply_drafts_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'discarded'::text]))),
  CONSTRAINT "work_reply_drafts_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_reply_drafts_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_reply_drafts"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX work_reply_drafts_open_request_key ON public.work_reply_drafts USING btree (request_id)
  WHERE (status = 'draft'::text);

CREATE INDEX work_reply_drafts_sent_by_idx ON public.work_reply_drafts USING btree (sent_by)
  WHERE (sent_by IS NOT NULL);

CREATE INDEX work_reply_drafts_work_item_id_idx ON public.work_reply_drafts USING btree (work_item_id);

CREATE INDEX work_reply_drafts_workspace_status_idx ON public.work_reply_drafts USING btree (workspace_id, status, created_at DESC);

CREATE POLICY "deny_direct_client_access" ON "public"."work_reply_drafts"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_reply_drafts" IS 'Replies to customers written by the support agent when their item is done. A person reviews, edits and sends each one; nothing is sent automatically. At most one open draft per request.';

REVOKE ALL ON TABLE "public"."work_reply_drafts" FROM "service_role";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."work_reply_drafts" TO "service_role";

REVOKE ALL ON TABLE "public"."work_reply_drafts" FROM "anon", "authenticated";

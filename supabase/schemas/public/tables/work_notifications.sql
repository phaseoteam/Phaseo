CREATE TABLE "public"."work_notifications" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id" uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "work_item_id" uuid,
  "kind"         text                     NOT NULL,
  "actor_name"   text,
  "body"         text                     NOT NULL DEFAULT ''::text,
  "read_at"      timestamp with time zone,
  "emailed_at"   timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_notifications_body_length_check" CHECK ((char_length(body) <= 2000)),
  CONSTRAINT "work_notifications_kind_check" CHECK ((kind = ANY (ARRAY['assigned'::text, 'comment'::text, 'mention'::text, 'state'::text, 'sla'::text, 'stalled'::text, 'error_spike'::text, 'agent'::text, 'reply_draft'::text]))),
  CONSTRAINT "work_notifications_pkey" PRIMARY KEY (id),
  CONSTRAINT "work_notifications_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_notifications_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_notifications_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_notifications"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_notifications_user_unread_idx ON public.work_notifications USING btree (user_id, workspace_id, created_at DESC)
  WHERE (read_at IS NULL);

CREATE INDEX work_notifications_email_due_idx ON public.work_notifications USING btree (created_at)
  WHERE ((read_at IS NULL) AND (emailed_at IS NULL));

CREATE INDEX work_notifications_user_created_idx ON public.work_notifications USING btree (user_id, workspace_id, created_at DESC);

CREATE INDEX work_notifications_work_item_id_idx ON public.work_notifications USING btree (work_item_id)
  WHERE (work_item_id IS NOT NULL);

CREATE INDEX work_notifications_workspace_id_idx ON public.work_notifications USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."work_notifications"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_notifications" IS 'A person''s work inbox: assignments, comments, mentions, state changes, SLA warnings, stalled items, error spikes, agent results and reply drafts waiting for review.';

REVOKE ALL ON TABLE "public"."work_notifications" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_notifications" TO "service_role";

REVOKE ALL ON TABLE "public"."work_notifications" FROM "anon", "authenticated";

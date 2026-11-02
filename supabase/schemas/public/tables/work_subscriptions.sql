CREATE TABLE "public"."work_subscriptions" (
  "work_item_id" uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "reason"       text                     NOT NULL DEFAULT 'manual'::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_subscriptions_pkey" PRIMARY KEY (work_item_id, user_id),
  CONSTRAINT "work_subscriptions_reason_check" CHECK ((reason = ANY (ARRAY['creator'::text, 'assignee'::text, 'commenter'::text, 'mention'::text, 'manual'::text]))),
  CONSTRAINT "work_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_subscriptions_work_item_id_fkey" FOREIGN KEY (work_item_id) REFERENCES public.work_items(id) ON DELETE CASCADE,
  CONSTRAINT "work_subscriptions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_subscriptions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX work_subscriptions_user_id_idx ON public.work_subscriptions USING btree (user_id);

CREATE INDEX work_subscriptions_workspace_id_idx ON public.work_subscriptions USING btree (workspace_id);

CREATE POLICY "deny_direct_client_access" ON "public"."work_subscriptions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_subscriptions" IS 'People following a work item, who get its notifications. Added automatically for the creator, assignee, commenters and people mentioned; removable by unsubscribing.';

REVOKE ALL ON TABLE "public"."work_subscriptions" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."work_subscriptions" TO "service_role";

REVOKE ALL ON TABLE "public"."work_subscriptions" FROM "anon", "authenticated";

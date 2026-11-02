CREATE TABLE "public"."work_reactions" (
  "event_id"     uuid                     NOT NULL,
  "workspace_id" uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "emoji"        text                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "work_reactions_emoji_check" CHECK ((emoji = ANY (ARRAY['+1'::text, '-1'::text, 'heart'::text, 'tada'::text, 'eyes'::text, 'rocket'::text]))),
  CONSTRAINT "work_reactions_pkey" PRIMARY KEY (event_id, user_id, emoji),
  CONSTRAINT "work_reactions_event_id_fkey" FOREIGN KEY (event_id) REFERENCES public.work_item_events(id) ON DELETE CASCADE,
  CONSTRAINT "work_reactions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "work_reactions_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."work_reactions"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."work_reactions"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."work_reactions" IS 'Reactions on work item comments: one row per person per emoji (a fixed set).';

REVOKE ALL ON TABLE "public"."work_reactions" FROM "service_role";

GRANT DELETE, INSERT, SELECT ON TABLE "public"."work_reactions" TO "service_role";

REVOKE ALL ON TABLE "public"."work_reactions" FROM "anon", "authenticated";

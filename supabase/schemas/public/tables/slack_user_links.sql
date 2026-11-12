CREATE TABLE "public"."slack_user_links" (
  "installation_id" uuid                     NOT NULL,
  "slack_user_id"   text                     NOT NULL,
  "user_id"         uuid                     NOT NULL,
  "linked_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_user_links_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_user_links_pkey" PRIMARY KEY (installation_id, slack_user_id),
  CONSTRAINT "slack_user_links_slack_user_id_check" CHECK ((slack_user_id ~ '^[UW][A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_user_links_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."slack_user_links"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX slack_user_links_user_idx ON public.slack_user_links USING btree (user_id);

CREATE POLICY "deny_direct_client_access" ON "public"."slack_user_links"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_user_links" IS 'Slack users who confirmed their Phaseo account. The agent only offers a workspace''s own usage data to linked members of that workspace.';

REVOKE ALL ON TABLE "public"."slack_user_links" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."slack_user_links" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_user_links" FROM "anon", "authenticated";

CREATE TABLE "public"."slack_agent_notes" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "installation_id" uuid                     NOT NULL,
  "kind"            text                     NOT NULL,
  "channel_id"      text,
  "text"            text                     NOT NULL,
  "done_at"         timestamp with time zone,
  "created_by"      text                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"      timestamp with time zone,
  CONSTRAINT "slack_agent_notes_channel_id_check" CHECK (((channel_id IS NULL) OR (channel_id ~ '^[CDG][A-Z0-9]{2,31}$'::text))),
  CONSTRAINT "slack_agent_notes_created_by_check" CHECK ((created_by ~ '^[UW][A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_agent_notes_done_check" CHECK (((kind = 'todo'::text) OR (done_at IS NULL))),
  CONSTRAINT "slack_agent_notes_expires_check" CHECK (((expires_at IS NULL) OR (expires_at > created_at))),
  CONSTRAINT "slack_agent_notes_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_agent_notes_kind_check" CHECK ((kind = ANY (ARRAY['note'::text, 'pin'::text, 'todo'::text]))),
  CONSTRAINT "slack_agent_notes_pkey" PRIMARY KEY (id),
  CONSTRAINT "slack_agent_notes_text_check" CHECK (((char_length(text) >= 1) AND (char_length(text) <= 500)))
);

ALTER TABLE "public"."slack_agent_notes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX slack_agent_notes_installation_idx ON public.slack_agent_notes USING btree (installation_id, created_at DESC);

CREATE TRIGGER slack_agent_notes_set_updated_at
  BEFORE UPDATE ON public.slack_agent_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."slack_agent_notes"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_agent_notes" IS 'The Slack agent''s memory: short notes, pins and to-dos it saved because someone asked it to remember something, never copies of Slack messages. A null channel_id is for the whole Slack workspace, otherwise one conversation. At most 500 per installation (save_slack_agent_note, the only way in). Admins see and delete them in Settings > Slack; uninstalling deletes them (delete_slack_agent_memory).';

COMMENT ON COLUMN "public"."slack_agent_notes"."created_by" IS 'The Slack user (U... or W...) who asked the agent to save it.';

COMMENT ON COLUMN "public"."slack_agent_notes"."expires_at" IS 'When set, the note is hidden from then on and deleted on the agent''s next turn or save in the installation.';

REVOKE ALL ON TABLE "public"."slack_agent_notes" FROM "service_role";

GRANT DELETE, SELECT, UPDATE ON TABLE "public"."slack_agent_notes" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_agent_notes" FROM "anon", "authenticated";

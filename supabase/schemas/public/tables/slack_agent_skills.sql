CREATE TABLE "public"."slack_agent_skills" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "installation_id" uuid                     NOT NULL,
  "name"            text                     NOT NULL,
  "description"     text                     NOT NULL,
  "instructions"    text                     NOT NULL,
  "created_by"      text                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "slack_agent_skills_created_by_check" CHECK ((created_by ~ '^[UW][A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_agent_skills_description_check" CHECK (((char_length(description) >= 1) AND (char_length(description) <= 200))),
  CONSTRAINT "slack_agent_skills_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_agent_skills_instructions_check" CHECK (((char_length(instructions) >= 1) AND (char_length(instructions) <= 4000))),
  CONSTRAINT "slack_agent_skills_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 60) AND (name = btrim(name)) AND (name !~ '[[:cntrl:]]'::text))),
  CONSTRAINT "slack_agent_skills_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."slack_agent_skills"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX slack_agent_skills_name_idx ON public.slack_agent_skills USING btree (installation_id, lower(name));

CREATE TRIGGER slack_agent_skills_set_updated_at
  BEFORE UPDATE ON public.slack_agent_skills
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE POLICY "deny_direct_client_access" ON "public"."slack_agent_skills"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_agent_skills" IS 'Instructions the Slack agent saved for a task people repeat, when someone asked it to save one. Names are unique per installation whatever their case. At most 100 per installation (save_slack_agent_skill, the only way in). Admins edit and delete them in Settings > Slack; uninstalling deletes them (delete_slack_agent_memory).';

COMMENT ON COLUMN "public"."slack_agent_skills"."created_by" IS 'The Slack user (U... or W...) who asked the agent to save it.';

REVOKE ALL ON TABLE "public"."slack_agent_skills" FROM "service_role";

GRANT DELETE, SELECT, UPDATE ON TABLE "public"."slack_agent_skills" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_agent_skills" FROM "anon", "authenticated";

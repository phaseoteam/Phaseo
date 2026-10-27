CREATE TABLE "public"."slack_installations" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "workspace_id"            uuid                     NOT NULL,
  "slack_app_id"            uuid,
  "team_id"                 text,
  "team_name"               text,
  "enterprise_id"           text,
  "bot_user_id"             text                     NOT NULL,
  "secrets_ciphertext"      text                     NOT NULL,
  "key_id"                  uuid,
  "guardrail_id"            uuid,
  "model"                   text                     NOT NULL DEFAULT 'phaseo/auto'::text,
  "instructions"            text,
  "access_mode"             text                     NOT NULL DEFAULT 'everyone'::text,
  "usage_data_mode"         text                     NOT NULL DEFAULT 'dm'::text,
  "usage_data_channel_ids"  text[]                   NOT NULL DEFAULT '{}'::text[],
  "plan_people"             integer                  NOT NULL DEFAULT 3,
  "over_plan"               text                     NOT NULL DEFAULT 'refuse'::text,
  "max_people"              integer,
  "monthly_cap_nanos"       bigint                   NOT NULL,
  "answers_per_person_hour" integer                  NOT NULL DEFAULT 60,
  "allow_guests"            boolean                  NOT NULL DEFAULT true,
  "allow_external_users"    boolean                  NOT NULL DEFAULT false,
  "status"                  text                     NOT NULL DEFAULT 'active'::text,
  "installed_by"            uuid,
  "installed_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "uninstalled_at"          timestamp with time zone,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "model_choice_enabled"    boolean                  NOT NULL DEFAULT false,
  "allowed_models"          text[]                   NOT NULL DEFAULT '{}'::text[],
  "memory_enabled"          boolean                  NOT NULL DEFAULT true,
  "bot_scopes"              text[],
  "search_mode"             text                     NOT NULL DEFAULT 'dm'::text,
  CONSTRAINT "slack_installations_access_mode_check" CHECK ((access_mode = ANY (ARRAY['everyone'::text, 'linked'::text]))),
  CONSTRAINT "slack_installations_allowed_models_check" CHECK ((cardinality(allowed_models) <= 10)),
  CONSTRAINT "slack_installations_answers_per_person_hour_check" CHECK (((answers_per_person_hour >= 1) AND (answers_per_person_hour <= 10000))),
  CONSTRAINT "slack_installations_bot_scopes_check" CHECK (((bot_scopes IS NULL) OR (cardinality(bot_scopes) <= 50))),
  CONSTRAINT "slack_installations_bot_user_id_check" CHECK ((bot_user_id ~ '^[UWB][A-Z0-9]{2,31}$'::text)),
  CONSTRAINT "slack_installations_enterprise_id_check" CHECK (((enterprise_id IS NULL) OR (enterprise_id ~ '^E[A-Z0-9]{2,31}$'::text))),
  CONSTRAINT "slack_installations_guardrail_id_fkey" FOREIGN KEY (guardrail_id) REFERENCES public.workspace_guardrails(id) ON DELETE SET NULL,
  CONSTRAINT "slack_installations_installed_by_fkey" FOREIGN KEY (installed_by) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "slack_installations_instructions_check" CHECK (((instructions IS NULL) OR (length(instructions) <= 8000))),
  CONSTRAINT "slack_installations_key_id_fkey" FOREIGN KEY (key_id) REFERENCES public.keys(id) ON DELETE SET NULL,
  CONSTRAINT "slack_installations_max_people_check" CHECK (((max_people IS NULL) OR (max_people >= 1))),
  CONSTRAINT "slack_installations_model_check" CHECK (((length(model) >= 1) AND (length(model) <= 200))),
  CONSTRAINT "slack_installations_monthly_cap_check" CHECK ((monthly_cap_nanos > 0)),
  CONSTRAINT "slack_installations_over_plan_check" CHECK ((over_plan = ANY (ARRAY['refuse'::text, 'move_up'::text]))),
  CONSTRAINT "slack_installations_pkey" PRIMARY KEY (id),
  CONSTRAINT "slack_installations_plan_people_check" CHECK (((plan_people >= 1) AND (plan_people <= 10000000))),
  CONSTRAINT "slack_installations_search_mode_check" CHECK ((search_mode = ANY (ARRAY['off'::text, 'dm'::text, 'dm_and_channels'::text]))),
  CONSTRAINT "slack_installations_secrets_check" CHECK ((length(secrets_ciphertext) > 0)),
  CONSTRAINT "slack_installations_slack_app_id_fkey" FOREIGN KEY (slack_app_id) REFERENCES public.slack_apps(id) ON DELETE RESTRICT,
  CONSTRAINT "slack_installations_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'payment_due'::text, 'uninstalled'::text]))),
  CONSTRAINT "slack_installations_team_check" CHECK (((team_id IS NOT NULL) OR (enterprise_id IS NOT NULL))),
  CONSTRAINT "slack_installations_team_id_check" CHECK (((team_id IS NULL) OR (team_id ~ '^T[A-Z0-9]{2,31}$'::text))),
  CONSTRAINT "slack_installations_uninstalled_check" CHECK (((status = 'uninstalled'::text) = (uninstalled_at IS NOT NULL))),
  CONSTRAINT "slack_installations_usage_data_channels_check" CHECK ((cardinality(usage_data_channel_ids) <= 100)),
  CONSTRAINT "slack_installations_usage_data_mode_check" CHECK ((usage_data_mode = ANY (ARRAY['off'::text, 'dm'::text, 'dm_and_channels'::text]))),
  CONSTRAINT "slack_installations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE
);

ALTER TABLE "public"."slack_installations"
  ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX slack_installations_live_team_idx ON public.slack_installations USING btree (COALESCE(enterprise_id, ''::text), COALESCE(team_id, ''::text))
  WHERE (status <> 'uninstalled'::text);

CREATE UNIQUE INDEX slack_installations_live_workspace_idx ON public.slack_installations USING btree (workspace_id)
  WHERE (status <> 'uninstalled'::text);

CREATE INDEX slack_installations_workspace_idx ON public.slack_installations USING btree (workspace_id, installed_at DESC);

CREATE TRIGGER slack_installations_set_updated_at
  BEFORE UPDATE ON public.slack_installations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_if_changed();

CREATE TRIGGER slack_installations_delete_agent_memory
  AFTER UPDATE OF status ON public.slack_installations
  FOR EACH ROW
  WHEN (((new.status = 'uninstalled'::text) AND (old.status IS DISTINCT FROM 'uninstalled'::text)))
  EXECUTE FUNCTION public.delete_slack_agent_memory();

CREATE POLICY "deny_direct_client_access" ON "public"."slack_installations"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_installations" IS 'The Phaseo Slack agent installed in a Slack workspace (or Enterprise Grid org). One live installation per Phaseo workspace and per Slack team, whichever app it uses; uninstalled rows are kept for billing history. A null slack_app_id means the hosted Phaseo app.';

COMMENT ON COLUMN "public"."slack_installations"."secrets_ciphertext" IS 'AES-GCM encrypted JSON {bot_token, gateway_key}, keyed by SLACK_SECRETS_ENCRYPTION_KEY. Never returned to clients.';

COMMENT ON COLUMN "public"."slack_installations"."key_id" IS 'The managed gateway key the agent uses. Model tokens are billed through it as normal requests.';

COMMENT ON COLUMN "public"."slack_installations"."guardrail_id" IS 'The guardrail attached to key_id that turns off training, prompt publishing and input/output logging, as Slack''s API terms require.';

COMMENT ON COLUMN "public"."slack_installations"."model_choice_enabled" IS 'Whether people may choose the model for one message by starting it with "with <model>:", from allowed_models. Off by default.';

COMMENT ON COLUMN "public"."slack_installations"."allowed_models" IS 'The models people may choose per message (up to 10 v2_models.model_slug values, or phaseo/auto where the workspace has Auto Routing). web-api checks each one; model stays the default.';

COMMENT ON COLUMN "public"."slack_installations"."memory_enabled" IS 'Whether the agent may save and read its notes, pins and to-dos (on by default). While off, turns get no note tools and no pins, and saved notes are kept for admins to see or delete. Saved skills work either way.';

COMMENT ON COLUMN "public"."slack_installations"."bot_scopes" IS 'The bot scopes Slack granted at the last install or permissions update (oauth.v2.access scope). Null for installations from before it was recorded, which have the original seven scopes. New features check it before using a scope, and Settings asks admins to update the Slack permissions when scopes are missing.';

COMMENT ON COLUMN "public"."slack_installations"."search_mode" IS 'Where the agent may search Slack as the person asking (Slack''s real-time search, with the search:read.public scope): off, dm (direct messages with the agent, the default, so only the person asking reads what it finds) or dm_and_channels. Search results are never stored.';

COMMENT ON COLUMN "public"."slack_installations"."plan_people" IS 'The people limit of the chosen plan. With over_plan = refuse, a new person beyond it is refused and admins are notified. The monthly charge follows the people who actually used the agent.';

COMMENT ON COLUMN "public"."slack_installations"."over_plan" IS 'refuse (default): refuse a new person beyond plan_people and notify admins. move_up: move up a plan automatically, up to max_people if set.';

COMMENT ON COLUMN "public"."slack_installations"."max_people" IS 'Optional hard limit on people per UTC month. Null means no limit.';

COMMENT ON COLUMN "public"."slack_installations"."monthly_cap_nanos" IS 'Monthly spending cap for the Slack agent''s own charges (plan, extra answers and, later, sandbox time), in nanodollars. Set at install. Answers pause when it is reached, and the month-end charge never exceeds it.';

COMMENT ON COLUMN "public"."slack_installations"."status" IS 'active; paused (by an admin); payment_due (a past month''s charge is waiting for credits, so answers pause until charge_slack_agent_month succeeds); uninstalled.';

REVOKE ALL ON TABLE "public"."slack_installations" FROM "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."slack_installations" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_installations" FROM "anon", "authenticated";

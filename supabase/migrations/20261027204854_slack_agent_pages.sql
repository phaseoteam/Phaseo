-- Slack agent: shared pages. The agent can publish a self-contained HTML page and
-- link it in its reply. The Slack Worker keeps the pages themselves (a Durable
-- Object per installation, deleted at expiry and on uninstall); these columns are
-- the admins' settings for them:
-- * pages_enabled: whether the agent may publish pages (on by default).
-- * page_expiry_days: how long a new page is kept (7, 30 or 90 days).
-- * page_default_access: who can view a new page unless the agent picks otherwise:
--   anyone with the link, or people in the Slack workspace who sign in with Slack.
-- * page_link_access: whether "anyone with the link" is allowed at all. Off, link
--   pages already published need a Slack sign-in too.

ALTER TABLE "public"."slack_installations"
  ADD COLUMN "pages_enabled" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."slack_installations"
  ADD COLUMN "page_expiry_days" integer NOT NULL DEFAULT 30;

ALTER TABLE "public"."slack_installations"
  ADD COLUMN "page_default_access" text NOT NULL DEFAULT 'link'::text;

ALTER TABLE "public"."slack_installations"
  ADD COLUMN "page_link_access" boolean NOT NULL DEFAULT true;

ALTER TABLE "public"."slack_installations"
  ADD CONSTRAINT "slack_installations_page_access_check" CHECK ((page_link_access OR (page_default_access = 'workspace'::text)));

ALTER TABLE "public"."slack_installations"
  ADD CONSTRAINT "slack_installations_page_default_access_check" CHECK ((page_default_access = ANY (ARRAY['link'::text, 'workspace'::text])));

ALTER TABLE "public"."slack_installations"
  ADD CONSTRAINT "slack_installations_page_expiry_days_check" CHECK ((page_expiry_days = ANY (ARRAY[7, 30, 90])));

COMMENT ON COLUMN "public"."slack_installations"."pages_enabled" IS 'Whether the agent may publish shared pages (on by default). Off, it publishes none; pages already published stay until they expire or an admin deletes them.';

COMMENT ON COLUMN "public"."slack_installations"."page_expiry_days" IS 'How many days a new shared page is kept before the Slack Worker deletes it: 7, 30 (default) or 90.';

COMMENT ON COLUMN "public"."slack_installations"."page_default_access" IS 'Who can view a new shared page unless the agent picks otherwise: link (anyone with the link) or workspace (people in the Slack workspace, after signing in with Slack).';

COMMENT ON COLUMN "public"."slack_installations"."page_link_access" IS 'Whether pages may be shared with anyone who has the link. Off, page_default_access must be workspace, and link pages already published need a Slack sign-in too.';

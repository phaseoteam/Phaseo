-- Slack agent: the bot scopes Slack granted at install. Charts, generated images
-- and reading shared files need files:write and files:read, which installations
-- from before them don't have; the Worker checks this column before using one,
-- and Settings offers to update the Slack permissions. Null means the original
-- seven scopes.

ALTER TABLE "public"."slack_installations"
  ADD COLUMN "bot_scopes" text[];

ALTER TABLE "public"."slack_installations"
  ADD CONSTRAINT "slack_installations_bot_scopes_check" CHECK (((bot_scopes IS NULL) OR (cardinality(bot_scopes) <= 50)));

COMMENT ON COLUMN "public"."slack_installations"."bot_scopes" IS 'The bot scopes Slack granted at the last install or permissions update (oauth.v2.access scope). Null for installations from before it was recorded, which have the original seven scopes. New features check it before using a scope, and Settings asks admins to update the Slack permissions when scopes are missing.';

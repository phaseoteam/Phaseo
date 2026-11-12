-- Slack agent: searching Slack as the person asking (search_slack, Slack's
-- real-time search with the search:read.public scope). Admins choose where it
-- may search: off, in direct messages with the agent (the default, so only the
-- person asking reads what it finds), or in channels too. Installations without
-- the search scopes can't search until an admin updates the Slack permissions.
-- Search results are never stored.

ALTER TABLE "public"."slack_installations"
  ADD COLUMN "search_mode" text NOT NULL DEFAULT 'dm'::text;

ALTER TABLE "public"."slack_installations"
  ADD CONSTRAINT "slack_installations_search_mode_check" CHECK ((search_mode = ANY (ARRAY['off'::text, 'dm'::text, 'dm_and_channels'::text])));

COMMENT ON COLUMN "public"."slack_installations"."search_mode" IS 'Where the agent may search Slack as the person asking (Slack''s real-time search, with the search:read.public scope): off, dm (direct messages with the agent, the default, so only the person asking reads what it finds) or dm_and_channels. Search results are never stored.';

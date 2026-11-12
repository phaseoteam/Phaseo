-- Two Slack agent access fixes from the 2026-11-04 access review.
--
-- 1. Account link tokens work once. The Slack agent DMs a signed link that ties a Slack user to
--    whoever confirms it; a forwarded link could be confirmed by someone else, and a link could be
--    confirmed again within its 15 minutes. The settings API records each confirmed token's nonce
--    here and refuses one it has seen. Rows are kept (one per confirmation, a few bytes each).
--
-- 2. Saving a company Slack app no longer reserves its Slack app id. Anyone could save someone
--    else's app id first and block its owner. Now the id is unique only among verified apps:
--    an app is verified when an install through it succeeds and Slack's OAuth response names the
--    same app id, which needs the app's real client secret. Apps that already have an installation
--    passed that check when they were installed, so they start verified.

ALTER TABLE "public"."slack_apps"
  ADD COLUMN "verified_at" timestamp with time zone;

UPDATE "public"."slack_apps" AS app
SET verified_at = app.created_at
WHERE EXISTS (SELECT 1 FROM "public"."slack_installations" AS installation WHERE installation.slack_app_id = app.id);

DROP INDEX IF EXISTS "public"."slack_apps_slack_app_id_idx";

CREATE INDEX slack_apps_slack_app_id_lookup_idx ON public.slack_apps USING btree (slack_app_id);

CREATE UNIQUE INDEX slack_apps_slack_app_id_idx ON public.slack_apps USING btree (slack_app_id)
  WHERE (verified_at IS NOT NULL);

COMMENT ON COLUMN "public"."slack_apps"."verified_at" IS 'When an install through this app succeeded and Slack confirmed its app id, proving the workspace owns it. Only verified apps hold their Slack app id exclusively.';

-- Changing a row's Slack app id or client id clears its verification in the database, so no code
-- path (including a save that read the row before it was verified) can keep it.
CREATE OR REPLACE FUNCTION public.slack_apps_reset_verification()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  -- Verification proves ownership of one Slack app id and client id; a row saved with another app
  -- is unverified until an install through it succeeds again, whichever code path saved it.
  if NEW.slack_app_id is distinct from OLD.slack_app_id or NEW.client_id is distinct from OLD.client_id then
    NEW.verified_at := null;
  end if;
  return NEW;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."slack_apps_reset_verification"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."slack_apps_reset_verification"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."slack_apps_reset_verification"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE TRIGGER slack_apps_reset_verification
  BEFORE UPDATE ON public.slack_apps
  FOR EACH ROW
  EXECUTE FUNCTION public.slack_apps_reset_verification();

CREATE TABLE "public"."slack_link_token_uses" (
  "nonce"           text                     NOT NULL,
  "installation_id" uuid                     NOT NULL,
  "slack_user_id"   text                     NOT NULL,
  "user_id"         uuid                     NOT NULL,
  "used_at"         timestamp with time zone NOT NULL DEFAULT now(),
  "expires_at"      timestamp with time zone NOT NULL,
  CONSTRAINT "slack_link_token_uses_installation_id_fkey" FOREIGN KEY (installation_id) REFERENCES public.slack_installations(id) ON DELETE CASCADE,
  CONSTRAINT "slack_link_token_uses_nonce_check" CHECK (((length(nonce) >= 8) AND (length(nonce) <= 128))),
  CONSTRAINT "slack_link_token_uses_pkey" PRIMARY KEY (nonce),
  CONSTRAINT "slack_link_token_uses_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."slack_link_token_uses"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deny_direct_client_access" ON "public"."slack_link_token_uses"
  AS RESTRICTIVE
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE "public"."slack_link_token_uses" IS 'Slack account link tokens that have been confirmed, by nonce, so each link works once. Only the settings API reads and writes it.';

REVOKE ALL ON TABLE "public"."slack_link_token_uses" FROM "service_role";

GRANT INSERT, SELECT ON TABLE "public"."slack_link_token_uses" TO "service_role";

REVOKE ALL ON TABLE "public"."slack_link_token_uses" FROM "anon", "authenticated";

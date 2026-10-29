-- Monthly spending limit on the OAuth consent screen.
-- * oauth_authorizations.key_monthly_limit_cost_nanos: the limit the person chose for a third-party
--   app (0 = no limit), stored when they approve.
-- * public.apply_oauth_consent_spend_limit: copies it to the app's delegated key when the key is
--   issued, as the key's monthly cost limit, which the gateway already enforces. Refreshes keep the
--   same key, so they keep it; the person can change it later under Settings, API Keys.
-- Hand-written: the declarative sync needs a local Postgres runtime (Docker), which is not
-- available where this was authored. It matches the definitions in schemas/.
SET local check_function_bodies = off;

ALTER TABLE "public"."oauth_authorizations"
  ADD COLUMN "key_monthly_limit_cost_nanos" bigint;

ALTER TABLE "public"."oauth_authorizations"
  ADD CONSTRAINT "oauth_authorizations_key_monthly_limit_cost_nanos_check" CHECK (((key_monthly_limit_cost_nanos IS NULL) OR (key_monthly_limit_cost_nanos >= 0)));

COMMENT ON COLUMN "public"."oauth_authorizations"."key_monthly_limit_cost_nanos" IS 'Monthly spending limit the person chose for this app on the consent screen, in nanodollars; 0 means no limit. Copied to the app''s delegated key when it is issued (apply_oauth_consent_spend_limit). NULL for authorizations made before the consent screen asked, and for first-party apps.';

CREATE OR REPLACE FUNCTION public.apply_oauth_consent_spend_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  chosen_limit bigint;
begin
  select authorization_row.key_monthly_limit_cost_nanos into chosen_limit
  from public.oauth_authorizations authorization_row
  where authorization_row.user_id = new.oauth_user_id
    and authorization_row.workspace_id = new.workspace_id
    and authorization_row.client_id = new.oauth_client_id;

  -- The gateway enforces it like any key's monthly cost limit; the person can change it later.
  if chosen_limit is not null then
    new.monthly_limit_cost_nanos := chosen_limit;
  end if;

  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."apply_oauth_consent_spend_limit"() IS 'Gives a third-party app''s new delegated key the monthly spending limit the person chose on the consent screen (oauth_authorizations.key_monthly_limit_cost_nanos).';

REVOKE ALL ON FUNCTION "public"."apply_oauth_consent_spend_limit"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."apply_oauth_consent_spend_limit"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."apply_oauth_consent_spend_limit"() FROM PUBLIC, "anon", "authenticated", "service_role";

CREATE TRIGGER apply_oauth_consent_spend_limit
  BEFORE INSERT ON public.keys
  FOR EACH ROW
  WHEN (((new.key_kind = 'oauth_delegated'::text) AND (new.issued_via = 'oauth_pkce'::text)))
  EXECUTE FUNCTION public.apply_oauth_consent_spend_limit();

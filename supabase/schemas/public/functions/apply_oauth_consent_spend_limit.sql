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

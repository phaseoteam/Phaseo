CREATE OR REPLACE FUNCTION public.protect_data_contribution_settings()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.data_contribution_enabled is distinct from false
        or new.data_contribution_policy_version is not null
        or new.data_contribution_consented_at is not null
        or new.data_contribution_consented_by is not null
        or new.data_contribution_sample_rate_bps is distinct from 10000
        or new.data_contribution_classifier_sample_rate_bps is distinct from 1000
        or new.data_contribution_discount_bps is distinct from 100 then
        raise exception 'data contribution settings are platform controlled'
          using errcode = '42501';
      end if;
      if new.io_logging_billing_status is distinct from 'active'
        or new.io_logging_grace_until is not null
        or new.io_logging_last_billed_at is not null
        or new.io_logging_last_billing_warning_at is not null
        or new.io_logging_last_billing_warning_kind is not null
        or new.io_logging_price_per_million_units_nanos is distinct from 0 then
        raise exception 'extended log billing settings are platform controlled'
          using errcode = '42501';
      end if;
    elsif new.data_contribution_enabled is distinct from old.data_contribution_enabled
      or new.data_contribution_policy_version is distinct from old.data_contribution_policy_version
      or new.data_contribution_consented_at is distinct from old.data_contribution_consented_at
      or new.data_contribution_consented_by is distinct from old.data_contribution_consented_by
      or new.data_contribution_sample_rate_bps is distinct from old.data_contribution_sample_rate_bps
      or new.data_contribution_classifier_sample_rate_bps is distinct from old.data_contribution_classifier_sample_rate_bps
      or new.data_contribution_discount_bps is distinct from old.data_contribution_discount_bps then
      raise exception 'data contribution settings are platform controlled'
        using errcode = '42501';
    elsif new.io_logging_billing_status is distinct from old.io_logging_billing_status
      or new.io_logging_grace_until is distinct from old.io_logging_grace_until
      or new.io_logging_last_billed_at is distinct from old.io_logging_last_billed_at
      or new.io_logging_last_billing_warning_at is distinct from old.io_logging_last_billing_warning_at
      or new.io_logging_last_billing_warning_kind is distinct from old.io_logging_last_billing_warning_kind
      or new.io_logging_price_per_million_units_nanos is distinct from old.io_logging_price_per_million_units_nanos then
      raise exception 'extended log billing settings are platform controlled'
        using errcode = '42501';
    end if;

    -- Single sign-on decides which workspace a provider's sign-ins join, so it is written only by the
    -- API and web-api (service role), which check the owner or admin role and the identity add-on.
    if tg_op = 'INSERT' then
      if new.sso_enabled is distinct from false
        or new.sso_enforced is distinct from false
        or new.sso_mode is distinct from 'none'
        or new.sso_provider_identifier is not null
        or new.sso_domains is distinct from '{}'::text[] then
        raise exception 'single sign-on settings are platform controlled'
          using errcode = '42501';
      end if;
    elsif new.sso_enabled is distinct from old.sso_enabled
      or new.sso_enforced is distinct from old.sso_enforced
      or new.sso_mode is distinct from old.sso_mode
      or new.sso_provider_identifier is distinct from old.sso_provider_identifier
      or new.sso_domains is distinct from old.sso_domains then
      raise exception 'single sign-on settings are platform controlled'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."protect_data_contribution_settings"() TO "service_role";

COMMENT ON FUNCTION "public"."protect_data_contribution_settings"() IS 'Prevents authenticated workspace administrators from forging platform-controlled contribution consent, billing terms, extended-log billing state and single sign-on settings.';

REVOKE ALL ON FUNCTION "public"."protect_data_contribution_settings"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_data_contribution_settings"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."protect_data_contribution_settings"() FROM PUBLIC, "anon", "authenticated";

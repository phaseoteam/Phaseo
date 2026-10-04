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
    elsif new.data_contribution_enabled is distinct from old.data_contribution_enabled
      or new.data_contribution_policy_version is distinct from old.data_contribution_policy_version
      or new.data_contribution_consented_at is distinct from old.data_contribution_consented_at
      or new.data_contribution_consented_by is distinct from old.data_contribution_consented_by
      or new.data_contribution_sample_rate_bps is distinct from old.data_contribution_sample_rate_bps
      or new.data_contribution_classifier_sample_rate_bps is distinct from old.data_contribution_classifier_sample_rate_bps
      or new.data_contribution_discount_bps is distinct from old.data_contribution_discount_bps then
      raise exception 'data contribution settings are platform controlled'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."protect_data_contribution_settings"() TO "service_role";

COMMENT ON FUNCTION "public"."protect_data_contribution_settings"() IS 'Prevents authenticated workspace administrators from forging platform-controlled contribution consent and billing terms.';

REVOKE ALL ON FUNCTION "public"."protect_data_contribution_settings"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."protect_data_contribution_settings"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."protect_data_contribution_settings"() FROM PUBLIC, "anon", "authenticated";

-- Security review 2026-11-02: three tables let signed-in users write columns through PostgREST that the
-- app's own checks never allow, and anon/authenticated held table privileges PostgREST never needs.
-- phaseo:allow-destructive-migration reason: the only match is the TRUNCATE privilege named in REVOKE statements below, taken away from anon and authenticated; no table is truncated, nothing is dropped and no data is deleted.

-- 1. OAuth app metadata. The API and web-api write it with the service role only, after checking the
-- caller is a workspace owner or admin. Direct client writes let any member mark an app first-party or
-- change a team app's redirect URIs, so signed-in users keep read access only. The member write
-- policies stay in place but no longer apply without the table privileges.
REVOKE ALL ON TABLE "public"."oauth_app_metadata" FROM "anon", "authenticated";

GRANT SELECT ON TABLE "public"."oauth_app_metadata" TO "authenticated";

-- 2. Presets. A creator could move their preset into any workspace (the update policy never checked
-- membership of the new workspace_id), and removed members kept edit rights. Both sides now require
-- membership of the row's workspace.
ALTER POLICY "presets_update_owned" ON "public"."presets"
  USING (((created_by = ( SELECT auth.uid() AS uid)) AND public.is_workspace_member(workspace_id)))
  WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND public.is_workspace_member(workspace_id)));

-- 3. Extended-log billing state on workspace_settings is platform controlled, like data contribution.
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
  end if;

  return new;
end;
$function$;

COMMENT ON FUNCTION "public"."protect_data_contribution_settings"() IS 'Prevents authenticated workspace administrators from forging platform-controlled contribution consent, billing terms and extended-log billing state.';

-- 4. TRUNCATE ignores row level security, and TRIGGER, MAINTAIN and REFERENCES are never needed by API
-- clients. Drop them from anon/authenticated on the tables this review touched and on keys and
-- workspace_members.
REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."presets" FROM "anon", "authenticated";

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."workspace_settings" FROM "anon", "authenticated";

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."keys" FROM "anon", "authenticated";

REVOKE MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."workspace_members" FROM "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.set_data_contribution_consent (
  p_workspace_id               uuid,
  p_enabled                    boolean,
  p_actor_type                 text,
  p_actor_user_id              uuid    DEFAULT NULL::uuid,
  p_actor_key_id               uuid    DEFAULT NULL::uuid,
  p_reason                     text    DEFAULT NULL::text,
  p_policy_version             text    DEFAULT '2026-07-26-v2'::text,
  p_sample_rate_bps            integer DEFAULT 10000,
  p_classifier_sample_rate_bps integer DEFAULT 1000,
  p_discount_bps               integer DEFAULT 100
)
  RETURNS public.workspace_settings
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_settings public.workspace_settings%rowtype;
begin
  if p_actor_type not in ('user', 'management_key', 'system') then
    raise exception 'invalid actor type';
  end if;
  if p_sample_rate_bps not between 0 and 10000
    or p_classifier_sample_rate_bps not between 0 and 10000
    or p_discount_bps not between 0 and 10000 then
    raise exception 'invalid contribution rates';
  end if;

  insert into public.workspace_settings (
    workspace_id, data_contribution_enabled, data_contribution_policy_version,
    data_contribution_consented_at, data_contribution_consented_by,
    data_contribution_sample_rate_bps, data_contribution_classifier_sample_rate_bps,
    data_contribution_discount_bps, updated_at
  ) values (
    p_workspace_id, p_enabled, p_policy_version,
    case when p_enabled then now() else null end,
    case when p_enabled then p_actor_user_id else null end,
    p_sample_rate_bps, p_classifier_sample_rate_bps, p_discount_bps, now()
  )
  on conflict (workspace_id) do update set
    data_contribution_enabled = excluded.data_contribution_enabled,
    data_contribution_policy_version = excluded.data_contribution_policy_version,
    data_contribution_consented_at = excluded.data_contribution_consented_at,
    data_contribution_consented_by = excluded.data_contribution_consented_by,
    data_contribution_sample_rate_bps = excluded.data_contribution_sample_rate_bps,
    data_contribution_classifier_sample_rate_bps = excluded.data_contribution_classifier_sample_rate_bps,
    data_contribution_discount_bps = excluded.data_contribution_discount_bps,
    updated_at = excluded.updated_at
  returning * into v_settings;

  insert into public.data_contribution_consent_events (
    workspace_id, actor_type, actor_user_id, actor_key_id, action, outcome,
    policy_version, sample_rate_bps, classifier_sample_rate_bps, discount_bps, reason
  ) values (
    p_workspace_id, p_actor_type, p_actor_user_id, p_actor_key_id,
    case when p_enabled then 'enabled' else 'disabled' end,
    'succeeded', p_policy_version, p_sample_rate_bps, p_classifier_sample_rate_bps, p_discount_bps,
    left(p_reason, 500)
  );

  if not p_enabled then
    update public.data_contributions
    set retention_until = least(retention_until, now()),
        available_at = greatest(available_at, now()),
        updated_at = now()
    where workspace_id = p_workspace_id
      and status <> 'deleted';
  end if;

  return v_settings;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_data_contribution_consent"(uuid, boolean, text, uuid, uuid, text, text, integer, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."set_data_contribution_consent"(uuid, boolean, text, uuid, uuid, text, text, integer, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_data_contribution_consent"(uuid, boolean, text, uuid, uuid, text, text, integer, integer, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_data_contribution_consent"(uuid, boolean, text, uuid, uuid, text, text, integer, integer, integer) FROM PUBLIC, "anon", "authenticated";

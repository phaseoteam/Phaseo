CREATE OR REPLACE FUNCTION public.create_mobile_notification_rule (
  p_user_id   uuid,
  p_rule      jsonb,
  p_max_rules integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
-- Adds a rule after the user's last one, unless they already have p_max_rules. p_rule holds
-- mobile_notification_rules columns; omitted ones take the table's defaults, and id, user_id
-- and position are ignored. Creates for one user run one at a time, so concurrent requests
-- can neither pass the limit nor share a position. Returns {"rule": {...}} or
-- {"error": "rule_limit_reached"}.
declare
  v_count integer;
  v_last_position integer;
  v_rule public.mobile_notification_rules%rowtype;
begin
  if p_user_id is null or jsonb_typeof(p_rule) is distinct from 'object' then
    raise exception 'invalid_mobile_notification_rule';
  end if;
  if p_max_rules is null or p_max_rules < 1 or p_max_rules > 1000 then
    raise exception 'invalid_mobile_notification_rule_limit';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mobile_notification_rules:' || p_user_id::text, 0));

  select count(*)::integer, max(r."position") into v_count, v_last_position
  from public.mobile_notification_rules r
  where r.user_id = p_user_id;

  if v_count >= p_max_rules then
    return jsonb_build_object('error', 'rule_limit_reached');
  end if;

  insert into public.mobile_notification_rules as r (
    user_id, name, enabled, action, event_kinds, lab_mode, lab_slugs, provider_mode, provider_slugs, model_slugs,
    input_modalities, output_modalities, only_on_phaseo, include_free_variants, "position"
  )
  select
    p_user_id,
    x.name,
    coalesce(x.enabled, true),
    coalesce(x.action, 'notify'),
    x.event_kinds,
    coalesce(x.lab_mode, 'all'),
    coalesce(x.lab_slugs, '{}'),
    coalesce(x.provider_mode, 'all'),
    coalesce(x.provider_slugs, '{}'),
    coalesce(x.model_slugs, '{}'),
    coalesce(x.input_modalities, '{}'),
    coalesce(x.output_modalities, '{}'),
    coalesce(x.only_on_phaseo, false),
    coalesce(x.include_free_variants, false),
    coalesce(v_last_position + 1, 0)
  from jsonb_populate_record(null::public.mobile_notification_rules, p_rule) as x
  returning r.* into v_rule;

  return jsonb_build_object('rule', to_jsonb(v_rule) - 'user_id' - 'created_at' - 'updated_at');
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_mobile_notification_rule"(uuid, jsonb, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."create_mobile_notification_rule"(uuid, jsonb, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_mobile_notification_rule"(uuid, jsonb, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_mobile_notification_rule"(uuid, jsonb, integer) FROM PUBLIC, "anon", "authenticated";

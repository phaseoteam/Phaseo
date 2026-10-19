CREATE OR REPLACE FUNCTION private.mobile_notification_rule_matches (
  p_rule              public.mobile_notification_rules,
  p_kind              text,
  p_lab_slug          text,
  p_provider_slug     text,
  p_model_slug        text,
  p_input_modalities  text[],
  p_output_modalities text[],
  p_on_phaseo         boolean
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  -- Lists left empty match anything. An event without a lab or provider matches "all" and
  -- "except" but never "only". Modality lists are all required. Mute rules ignore
  -- include_free_variants, so muting a lab also mutes its free variants. A provider launching
  -- on Phaseo (provider_launched, which has no model or lab) is matched by rules about Phaseo
  -- availability or new providers, so rules written before it existed pick it up.
  select p_rule.enabled
    and (
      p_kind = any (p_rule.event_kinds)
      or (p_kind = 'provider_launched' and p_rule.event_kinds && ARRAY['gateway_available', 'provider_added'])
    )
    and (
      p_rule.lab_mode = 'all'
      or (p_rule.lab_mode = 'only' and coalesce(p_lab_slug = any (p_rule.lab_slugs), false))
      or (p_rule.lab_mode = 'except' and not coalesce(p_lab_slug = any (p_rule.lab_slugs), false))
    )
    and (
      p_rule.provider_mode = 'all'
      or (p_rule.provider_mode = 'only' and coalesce(p_provider_slug = any (p_rule.provider_slugs), false))
      or (p_rule.provider_mode = 'except' and not coalesce(p_provider_slug = any (p_rule.provider_slugs), false))
    )
    and (cardinality(p_rule.model_slugs) = 0 or coalesce(p_model_slug = any (p_rule.model_slugs), false))
    and (cardinality(p_rule.input_modalities) = 0 or coalesce(p_input_modalities @> p_rule.input_modalities, false))
    and (cardinality(p_rule.output_modalities) = 0 or coalesce(p_output_modalities @> p_rule.output_modalities, false))
    and (not p_rule.only_on_phaseo or coalesce(p_on_phaseo, false))
    and (p_rule.action = 'mute' or p_rule.include_free_variants or p_model_slug is null or p_model_slug !~ ':free$');
$function$;

REVOKE ALL ON FUNCTION "private"."mobile_notification_rule_matches"(public.mobile_notification_rules, text, text, text, text, text[], text[], boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."mobile_notification_rule_matches"(public.mobile_notification_rules, text, text, text, text, text[], text[], boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."mobile_notification_rule_matches"(public.mobile_notification_rules, text, text, text, text, text[], text[], boolean) TO "postgres";

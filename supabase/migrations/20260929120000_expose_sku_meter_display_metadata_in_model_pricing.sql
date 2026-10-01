-- Keep the public model pricing RPC aligned with the canonical SKU meter rows.
-- Patch the underlying projection so the stealth redaction wrapper and its
-- grants remain unchanged.
do $migration$
declare
  definition text;
  old_projection constant text := $old$'meter', meter.meter_key,
          'unit', meter.unit,$old$;
  new_projection constant text := $new$'meter', meter.meter_key,
          'rule_id', meter.sku_meter_id,
          'modality', meter.modality,
          'direction', meter.direction,
          'display_label', meter.display_label,
          'display_unit', meter.display_unit,
          'unit', meter.unit,$new$;
begin
  select pg_get_functiondef(
    'public.get_v2_model_pricing_without_stealth_redaction(text,text,text)'::regprocedure
  ) into definition;

  if position(new_projection in definition) > 0 then
    return;
  end if;
  if position(old_projection in definition) = 0
     or position(old_projection in substring(definition from position(old_projection in definition) + length(old_projection))) > 0 then
    raise exception 'get_v2_model_pricing_without_stealth_redaction has an unexpected meter projection';
  end if;

  execute replace(definition, old_projection, new_projection);
end
$migration$;

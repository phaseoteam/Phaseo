CREATE OR REPLACE FUNCTION public.provider_catalog_field_value(p_model jsonb, p_field text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $function$
declare current_value jsonb := p_model; part text;
begin
  if p_model is null then return null; end if;
  if p_field='$model' then return p_model; end if;
  if p_field='$removed' then return 'false'::jsonb; end if;
  if left(p_field,1) <> '/' then return p_model->p_field; end if;
  foreach part in array string_to_array(substr(p_field,2),'/') loop
    part := replace(replace(part,'~1','/'),'~0','~');
    if part='$rate' then return jsonb_build_object('priceNanos',current_value->'priceNanos','unitQuantity',current_value->'unitQuantity','unit',current_value->'unit','displayUnit',current_value->'displayUnit'); end if;
    if jsonb_typeof(current_value)='array' then
      select value into current_value from jsonb_array_elements(current_value) where coalesce(value->>'meterKey',value->>'serviceTier')=part limit 1;
    else current_value := current_value->part;
    end if;
    if current_value is null then return null; end if;
  end loop;
  return current_value;
end;
$function$;
REVOKE ALL ON FUNCTION public.provider_catalog_field_value(jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provider_catalog_field_value(jsonb,text) TO service_role;

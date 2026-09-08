-- Retired meters remain available to historical request/ledger references,
-- but must not be advertised alongside their replacement billing units.
-- Patch the underlying projections, preserving the public lifecycle/stealth
-- wrappers and each function's existing security attributes and grants.
do $$
declare
  signature text;
  function_oid regprocedure;
  definition text;
  old_join constant text := 'join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id';
  new_join constant text := 'join public.v2_pricing_sku_meters meter on meter.sku_id = sku.sku_id and meter.billable';
begin
  foreach signature in array array[
    'public.get_v2_model_pricing_without_stealth_redaction(text,text,text)',
    'public.get_v2_public_models_page_rows_without_lifecycle(text,text)'
  ] loop
    function_oid := to_regprocedure(signature);
    if function_oid is null then
      raise exception 'Missing pricing projection %', signature;
    end if;
    definition := pg_get_functiondef(function_oid);
    if strpos(definition, new_join) > 0 then
      continue;
    end if;
    if array_length(string_to_array(definition, old_join), 1) <> 2 then
      raise exception 'Unexpected pricing meter join in %', signature;
    end if;
    execute replace(definition, old_join, new_join);
  end loop;
end;
$$;

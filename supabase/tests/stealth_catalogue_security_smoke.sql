-- Rollback-only contract checks for stealth catalogue privacy.
begin;

do $$
declare
  route_policy text;
  models_page_definition text;
  pricing_definition text;
  raw_pricing_definition text;
  overview_definition text;
  rpc_signature text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'v2_model_provider_routes'
      and column_name = 'is_stealth'
      and data_type = 'boolean'
  ) then
    raise exception 'stealth_route_marker_missing';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'v2_model_provider_routes'
      and constraint_row.conname = 'v2_model_provider_routes_stealth_public_id_check'
  ) then
    raise exception 'stealth_route_public_id_constraint_missing';
  end if;

  select qual into route_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'v2_model_provider_routes'
    and policyname = 'v2_model_provider_routes_public_select';

  if route_policy is null or position('is_stealth = false' in route_policy) = 0 then
    raise exception 'stealth_route_public_policy_missing';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_v2_public_models_page_rows_without_stealth_redaction(text,text)',
    'execute'
  ) then
    raise exception 'raw_models_page_rpc_executable_by_anon';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_v2_public_models_page_rows_without_lifecycle(text,text)',
    'execute'
  ) then
    raise exception 'pre_lifecycle_models_page_rpc_executable_by_anon';
  end if;

  -- Public HTTP routes call these RPCs through the service-role web API.
  -- The database functions themselves must remain inaccessible to browser roles.
  foreach rpc_signature in array array[
    'public.get_v2_public_models_page_rows(text,text)',
    'public.get_v2_model_pricing(text,text,text)',
    'public.get_v2_model_overview(text,text,text)'
  ] loop
    if has_function_privilege('anon', rpc_signature, 'execute')
      or has_function_privilege('authenticated', rpc_signature, 'execute') then
      raise exception 'service_catalogue_rpc_executable_by_browser_role: %', rpc_signature;
    end if;
    if not has_function_privilege('service_role', rpc_signature, 'execute') then
      raise exception 'service_catalogue_rpc_not_executable_by_service_role: %', rpc_signature;
    end if;
  end loop;

  if has_function_privilege(
    'anon',
    'public.get_v2_model_pricing_without_stealth_redaction(text,text,text)',
    'execute'
  ) then
    raise exception 'raw_model_pricing_rpc_executable_by_anon';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_v2_model_overview_without_stealth_redaction(text,text,text)',
    'execute'
  ) then
    raise exception 'raw_model_overview_rpc_executable_by_anon';
  end if;

  if has_function_privilege(
    'anon',
    'public.get_monitor_model_rows(boolean)',
    'execute'
  ) then
    raise exception 'raw_monitor_rpc_executable_by_anon';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.get_monitor_model_rows(boolean)',
    'execute'
  ) then
    raise exception 'raw_monitor_rpc_executable_by_authenticated';
  end if;

  if not coalesce((
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = 'public.get_v2_public_models_page_rows(text,text)'::regprocedure
  ), false) or not coalesce((
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = 'public.get_v2_model_pricing(text,text,text)'::regprocedure
  ), false) or not coalesce((
    select procedure.prosecdef
    from pg_proc procedure
    where procedure.oid = 'public.get_v2_model_overview(text,text,text)'::regprocedure
  ), false) then
    raise exception 'redacted_public_rpcs_are_not_security_definer';
  end if;

  select pg_get_functiondef('public.get_v2_public_models_page_rows(text,text)'::regprocedure)
    into models_page_definition;
  if position('gateway_execution_regions' in models_page_definition) = 0 then
    raise exception 'models_page_region_aggregate_not_recomputed_after_redaction';
  end if;

  select pg_get_functiondef('public.get_v2_model_pricing(text,text,text)'::regprocedure)
    into pricing_definition;
  if position('''execution_region'', null' in lower(pricing_definition)) = 0
    or position('''data_region'', null' in lower(pricing_definition)) = 0 then
    raise exception 'pricing_provider_model_regions_not_redacted';
  end if;

  select pg_get_functiondef(
    'public.get_v2_model_pricing_without_stealth_redaction(text,text,text)'::regprocedure
  ) into raw_pricing_definition;
  if position('where variant.status <> ''disabled''' in raw_pricing_definition) > 0
    or position('and route.status <> ''disabled''' in raw_pricing_definition) > 0
    or position('variant.status as variant_status' in raw_pricing_definition) = 0
    or position('and model.variant_routing_enabled' in raw_pricing_definition) = 0 then
    raise exception 'public_pricing_hides_inactive_provider_routes';
  end if;

  select pg_get_functiondef('public.get_v2_model_overview(text,text,text)'::regprocedure)
    into overview_definition;
  if position('from jsonb_array_elements(redacted.routes)' in lower(overview_definition)) = 0
    or position('route_item.item - ''variant_id'' - ''variant_key''' in lower(overview_definition)) = 0 then
    raise exception 'overview_region_aggregate_not_recomputed_after_redaction';
  end if;
end
$$;

rollback;

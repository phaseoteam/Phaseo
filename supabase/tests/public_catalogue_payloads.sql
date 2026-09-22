-- Run after the catalogue payload migration. Read-only equivalence checks.
begin;
set local statement_timeout = '30s';

do $test$
declare
  difference_count bigint;
  expected_payload jsonb;
  actual_payload jsonb;
begin
  with original as materialized (
    select payload from public.get_public_models_page_rows() payload
  ), wrapped as materialized (
    select payload from jsonb_array_elements(public.get_public_models_page_payload()) payload
  )
  select count(*) into difference_count from (
    (select * from original except all select * from wrapped)
    union all
    (select * from wrapped except all select * from original)
  ) differences;
  if difference_count <> 0 then raise exception 'Catalogue payload differs from row RPC'; end if;

  select coalesce(
    jsonb_agg(
      payload order by
        nullif(payload->>'primary_timestamp', '')::numeric desc nulls last,
        model.created_at desc nulls last,
        position
    ),
    '[]'::jsonb
  )
  into expected_payload
  from public.get_public_models_page_rows() with ordinality as rows(payload, position)
  left join public.v2_models model on model.model_slug = payload->>'model_id';

  select public.get_public_models_page_payload() into actual_payload;
  if actual_payload <> expected_payload then
    raise exception 'Catalogue payload is not ordered by lifecycle date and catalogue availability';
  end if;

  with original as materialized (
    select payload from public.get_v2_public_models_page_rows('us', 'standard') payload
  ), wrapped as materialized (
    select payload from jsonb_array_elements(public.get_public_models_page_payload('us', 'standard')) payload
  )
  select count(*) into difference_count from (
    (select * from original except all select * from wrapped)
    union all
    (select * from wrapped except all select * from original)
  ) differences;
  if difference_count <> 0 then raise exception 'Scoped catalogue payload differs from row RPC'; end if;

  select coalesce(
    jsonb_agg(
      payload order by
        nullif(payload->>'primary_timestamp', '')::numeric desc nulls last,
        model.created_at desc nulls last,
        position
    ),
    '[]'::jsonb
  )
  into expected_payload
  from public.get_v2_public_models_page_rows('us', 'standard')
    with ordinality as rows(payload, position)
  left join public.v2_models model on model.model_slug = payload->>'model_id';

  select public.get_public_models_page_payload('us', 'standard') into actual_payload;
  if actual_payload <> expected_payload then
    raise exception 'Scoped catalogue payload is not ordered by lifecycle date and catalogue availability';
  end if;

  with original as materialized (
    select to_jsonb(row) payload from public.get_monitor_model_rows(false) row
  ), wrapped as materialized (
    select payload from jsonb_array_elements(public.get_public_monitor_rows_payload()) payload
  )
  select count(*) into difference_count from (
    (select * from original except all select * from wrapped)
    union all
    (select * from wrapped except all select * from original)
  ) differences;
  if difference_count <> 0 then raise exception 'Monitor payload differs from row RPC'; end if;

  if has_function_privilege('anon', 'public.get_public_models_page_payload(text,text,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_public_models_page_payload(text,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_public_monitor_rows_payload()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.get_public_monitor_rows_payload()', 'EXECUTE') then
    raise exception 'Bulk payload RPCs must remain service-role only';
  end if;
end;
$test$;
rollback;

-- Run after the catalogue payload migration. Read-only equivalence checks.
begin;
set local statement_timeout = '30s';

do $test$
declare
  difference_count bigint;
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

do $$
begin
  if exists (
    select 1
    from pg_type
    where typname = 'data_api_provider_capability_status'
  ) and not exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'data_api_provider_capability_status'
      and e.enumlabel = 'coming_soon'
  ) then
    alter type public.data_api_provider_capability_status add value 'coming_soon';
  end if;
end $$;

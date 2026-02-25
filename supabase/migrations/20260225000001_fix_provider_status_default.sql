-- Align provider status default with the expanded status constraint.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'data_api_providers'
      and column_name = 'status'
  ) then
    update public.data_api_providers
    set status = case
      when status is null then 'Active'
      when lower(trim(status)) in ('active', 'stable', 'ga', 'prod', 'production') then 'Active'
      when lower(trim(status)) = 'beta' then 'Beta'
      when lower(trim(status)) = 'alpha' then 'Alpha'
      when lower(trim(status)) in ('notready', 'not_ready', 'not-ready', 'unverified', 'unknown') then 'NotReady'
      else 'Active'
    end;

    alter table public.data_api_providers
      alter column status set default 'Active';
  end if;
end $$;

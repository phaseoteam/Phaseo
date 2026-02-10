-- Expand provider rollout statuses to include NotReady.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'data_api_providers'
      and column_name = 'status'
  ) then
    alter table public.data_api_providers
      drop constraint if exists data_api_providers_status_check;

    update public.data_api_providers
    set status = case
      when status is null then 'Active'
      when lower(trim(status)) in ('active', 'stable', 'ga', 'prod', 'production') then 'Active'
      when lower(trim(status)) = 'beta' then 'Beta'
      when lower(trim(status)) = 'alpha' then 'Alpha'
      else 'NotReady'
    end;

    alter table public.data_api_providers
      add constraint data_api_providers_status_check
      check (status in ('Active', 'Beta', 'Alpha', 'NotReady'));
  end if;
end $$;

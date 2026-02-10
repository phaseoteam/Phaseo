-- Add status flag to API providers (Active/Beta/Alpha/Unverified)

alter table if exists public.data_api_providers
  add column if not exists status text not null default 'Unverified';
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'data_api_providers_status_check'
  ) then
    alter table public.data_api_providers
      add constraint data_api_providers_status_check
      check (status in ('Active', 'Beta', 'Alpha', 'Unverified'));
  end if;
end $$;

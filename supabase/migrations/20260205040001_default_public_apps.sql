-- Make apps public by default for new rows
alter table public.api_apps
  alter column is_public set default true;

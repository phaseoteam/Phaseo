create table if not exists public.data_api_model_page_notices (
  api_model_id text primary key
    check (length(trim(api_model_id)) > 0),
  tone text not null
    check (tone in ('info', 'warning', 'critical')),
  markdown text not null
    check (length(trim(markdown)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.data_api_model_page_notices enable row level security;

drop policy if exists "Public can read model page notices" on public.data_api_model_page_notices;
create policy "Public can read model page notices"
on public.data_api_model_page_notices
for select
to anon, authenticated
using (true);

grant select on public.data_api_model_page_notices to anon, authenticated;
grant all on public.data_api_model_page_notices to service_role;

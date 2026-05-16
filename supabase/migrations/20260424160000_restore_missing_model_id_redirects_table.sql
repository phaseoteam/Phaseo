create table if not exists public.data_model_id_redirects (
  legacy_model_id text primary key,
  model_id text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists data_model_id_redirects_model_id_idx
  on public.data_model_id_redirects(model_id);
grant select, insert, update, delete on public.data_model_id_redirects to service_role;
grant select on public.data_model_id_redirects to authenticated;

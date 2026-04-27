create table if not exists public.data_model_id_redirects (
  legacy_model_id text primary key,
  model_id text not null,
  source text not null default 'compat_restore',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_model_id_redirects_model_id_idx
  on public.data_model_id_redirects(model_id);

comment on table public.data_model_id_redirects is
  'Compatibility restore for legacy model id redirects expected by April 24 monitor migrations.';

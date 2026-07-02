alter table public.api_apps
  add column if not exists category text,
  add column if not exists docs_url text;

alter table public.api_apps
  drop constraint if exists api_apps_category_check;

alter table public.api_apps
  add constraint api_apps_category_check
  check (
    category is null
    or category ~ '^(chat|developer-tools|research|productivity|education|commerce|media|finance|other)(,(chat|developer-tools|research|productivity|education|commerce|media|finance|other)){0,2}$'
  );

create index if not exists idx_api_apps_public_active_category
  on public.api_apps (category)
  where is_public = true and is_active = true and category is not null;

create index if not exists idx_api_apps_public_active_docs_url
  on public.api_apps (docs_url)
  where is_public = true and is_active = true and docs_url is not null;

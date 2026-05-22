-- Persist redirect URIs alongside OAuth app metadata so callback URL lookups
-- and settings views can resolve apps without querying Supabase Auth internals.

alter table public.oauth_app_metadata
  add column if not exists redirect_uris text[] not null default '{}'::text[];
create index if not exists oauth_app_metadata_redirect_uris_gin_idx
  on public.oauth_app_metadata using gin (redirect_uris);
comment on column public.oauth_app_metadata.redirect_uris is
  'Registered OAuth callback URLs for this app (mirrors Supabase OAuth client redirect_uris).';

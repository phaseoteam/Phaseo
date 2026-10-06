-- Official desktop public client. PKCE is required by the existing authorize route.
-- The native callback accepts an ephemeral loopback port, never a remote URL.
insert into public.oauth_clients (
  id, name, description, homepage_url, client_type, redirect_uris,
  allowed_scopes, is_first_party, beta_status, status
) values (
  'phaseo_desktop', 'Phaseo Desktop', 'Official Phaseo desktop application.',
  'https://phaseo.app', 'public', array['http://127.0.0.1/callback'],
  array['openid', 'profile', 'email', 'gateway:access', 'models:read'],
  true, 'beta', 'active'
) on conflict (id) do nothing;

-- Restored from Phaseo Prod migration records; preserve the recorded version and SQL.
-- phaseo:allow-production-history-backfill reason: Restore already-applied production history so deployment can validate recorded versions.
insert into public.oauth_clients (id, name, description, homepage_url, client_type, redirect_uris, allowed_scopes, is_first_party, beta_status, status) values ('phaseo_desktop', 'Phaseo Desktop', 'Official Phaseo desktop application.', 'https://phaseo.app', 'public', array['http://127.0.0.1/callback'], array['openid','profile','email','gateway:access','models:read'], true, 'beta', 'active') on conflict (id) do nothing;


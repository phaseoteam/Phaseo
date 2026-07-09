-- Rename the first-party CLI OAuth client for the Phaseo rebrand.

do $$
begin
  if to_regclass('public.oauth_clients') is not null then
    insert into public.oauth_clients (
      id,
      name,
      description,
      logo_url,
      homepage_url,
      client_type,
      client_secret_hash,
      redirect_uris,
      allowed_scopes,
      is_first_party,
      beta_status,
      status,
      created_at,
      updated_at,
      revoked_at
    )
    select
      'phaseo_cli',
      'Phaseo CLI',
      description,
      logo_url,
      homepage_url,
      client_type,
      client_secret_hash,
      redirect_uris,
      allowed_scopes,
      is_first_party,
      beta_status,
      status,
      created_at,
      now(),
      revoked_at
    from public.oauth_clients
    where id = 'aistats_cli'
    on conflict (id) do update set
      name = excluded.name,
      description = excluded.description,
      logo_url = excluded.logo_url,
      homepage_url = excluded.homepage_url,
      client_type = excluded.client_type,
      client_secret_hash = excluded.client_secret_hash,
      redirect_uris = excluded.redirect_uris,
      allowed_scopes = excluded.allowed_scopes,
      is_first_party = excluded.is_first_party,
      beta_status = excluded.beta_status,
      status = excluded.status,
      updated_at = now(),
      revoked_at = excluded.revoked_at;

    delete from public.oauth_clients
    where id = 'aistats_cli';
  end if;
end $$;

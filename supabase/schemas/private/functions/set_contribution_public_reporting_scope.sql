create or replace function private.set_contribution_public_reporting_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.public_reporting_allowed := new.provider_slug is not null
    and public.public_reporting_route_is_visible(new.model_slug, null, new.provider_slug, new.occurred_at);
  if tg_op = 'UPDATE' then
    new.public_reporting_allowed := old.public_reporting_allowed and new.public_reporting_allowed;
  end if;
  return new;
end;
$$;
revoke all on function private.set_contribution_public_reporting_scope() from public, anon, authenticated;

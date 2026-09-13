-- phaseo:allow-production-history-backfill reason: Restore SQL already applied to production under this recorded migration version.
-- Provider onboarding reuses an owned personal workspace. It must never adopt
-- the active/default workspace: that may belong to another organization.
drop index if exists public.provider_account_links_one_active_provider_per_workspace_idx;
create index if not exists provider_account_links_active_workspace_idx
  on public.provider_account_links (workspace_id) where status = 'active';

create or replace function public.link_provider_personal_account(
  p_user_id uuid, p_provider_slug text, p_proof_subject text, p_proof_method text default 'catalog_domain_match'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if p_proof_method not in ('catalog_domain_match', 'domain_file', 'self_declared') then
    raise exception 'invalid_provider_proof_method';
  end if;
  -- Serialize submissions from one account, including different provider slugs.
  perform 1 from public.users where user_id = p_user_id for update;
  if not found then
    raise exception 'provider_account_user_missing';
  end if;

  select l.workspace_id into v_workspace_id from public.provider_account_links l
  join public.workspaces w on w.id = l.workspace_id
  where l.provider_slug = p_provider_slug and l.linked_by = p_user_id
    and l.status = 'active' and w.owner_user_id = p_user_id;
  if found then return v_workspace_id; end if;

  select id into v_workspace_id from public.workspaces
  where owner_user_id = p_user_id and workspace_kind = 'personal'
  order by created_at, id limit 1;

  if v_workspace_id is null then
    insert into public.workspaces (name, slug, owner_user_id, workspace_kind)
    values ('Personal', replace(p_user_id::text, '-', '')::text || '-p', p_user_id, 'personal')
    returning id into v_workspace_id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, p_user_id, 'owner')
  on conflict on constraint workspace_members_pkey do nothing;
  insert into public.workspace_settings (workspace_id) values (v_workspace_id)
  on conflict on constraint workspace_settings_pkey do nothing;

  insert into public.provider_account_links
    (provider_slug, workspace_id, linked_by, role, status, proof_method, proof_subject, verified_at)
  values (p_provider_slug, v_workspace_id, p_user_id, 'owner', 'active',
    p_proof_method, p_proof_subject, case when p_proof_method = 'self_declared' then null else now() end);

  update public.users set default_workspace_id = v_workspace_id
  where user_id = p_user_id and lower(coalesce(role, 'user')) <> 'admin';
  return v_workspace_id;
end;
$$;

-- Only the server may link an account after verifying provider ownership.
revoke all on function public.link_provider_personal_account(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.link_provider_personal_account(uuid, text, text, text) to service_role;

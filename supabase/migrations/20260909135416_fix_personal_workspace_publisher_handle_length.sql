-- phaseo:allow-production-history-backfill reason: This exact migration is already applied in production; recording it reconciles history so the catalog cutover can deploy.
-- Keep generated marketplace handles within the 40-character public format.
-- Personal workspace slugs reserve nine characters for the '-personal' suffix,
-- so the provisioning RPC keeps the user-derived portion to 31 characters.

create or replace function public.default_workspace_publisher_handle()
returns trigger
language plpgsql
security invoker
set search_path = public
as $function$
begin
  if nullif(new.publisher_handle, '') is null then
    new.publisher_handle := lower(regexp_replace(regexp_replace(coalesce(nullif(new.slug, ''), new.name), '[^a-zA-Z0-9_-]+', '-', 'g'), '^-+|-+$', '', 'g'));

    if length(new.publisher_handle) < 3 then
      new.publisher_handle := 'workspace-' || left(new.id::text, 8);
    end if;

    new.publisher_handle := left(new.publisher_handle, 40);
  end if;

  return new;
end
$function$;

drop trigger if exists workspaces_default_publisher_handle on public.workspaces;
create trigger workspaces_default_publisher_handle
before insert on public.workspaces
for each row execute function public.default_workspace_publisher_handle();

revoke all on function public.default_workspace_publisher_handle() from public;

create or replace function public.provision_personal_workspace(
  p_user_id uuid,
  p_display_name text default null
)
returns table (
  workspace_id uuid,
  created_workspace boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
  v_default_workspace_id uuid;
  v_existing_workspace_id uuid;
  v_has_access boolean := false;
  v_default_workspace_is_owner boolean := false;
  v_created_workspace boolean := false;
  v_base_slug text;
  v_slug_attempt text;
  v_attempt integer := 0;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'missing_user_id';
  end if;

  v_display_name := nullif(trim(coalesce(p_display_name, '')), '');
  if v_display_name is null then
    v_display_name := 'User';
  end if;

  insert into public.users (user_id, display_name)
  values (p_user_id, v_display_name)
  on conflict (user_id) do update
    set display_name = coalesce(nullif(excluded.display_name, ''), public.users.display_name);

  select u.default_workspace_id
  into v_default_workspace_id
  from public.users u
  where u.user_id = p_user_id
  limit 1;

  if v_default_workspace_id is not null then
    select exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = v_default_workspace_id
        and wm.user_id = p_user_id

      union all

      select 1
      from public.workspaces w
      where w.id = v_default_workspace_id
        and w.owner_user_id = p_user_id
    )
    into v_has_access;

    select exists (
      select 1
      from public.workspaces w
      where w.id = v_default_workspace_id
        and w.owner_user_id = p_user_id
    )
    into v_default_workspace_is_owner;

    if v_has_access then
      if v_default_workspace_is_owner then
        insert into public.workspace_members (workspace_id, user_id, role)
        values (v_default_workspace_id, p_user_id, 'owner')
        on conflict on constraint workspace_members_pkey do nothing;
      end if;

      insert into public.workspace_settings (workspace_id)
      values (v_default_workspace_id)
      on conflict on constraint workspace_settings_pkey do nothing;

      return query
      select v_default_workspace_id, false;
      return;
    end if;

    update public.users
    set default_workspace_id = null
    where user_id = p_user_id
      and default_workspace_id = v_default_workspace_id;
  end if;

  select w.id
  into v_existing_workspace_id
  from public.workspaces w
  where w.owner_user_id = p_user_id
  order by w.created_at asc
  limit 1;

  if v_existing_workspace_id is null then
    v_base_slug := regexp_replace(lower(v_display_name), '[^a-z0-9]+', '-', 'g');
    v_base_slug := regexp_replace(v_base_slug, '^-+|-+$', '', 'g');
    if v_base_slug = '' then
      v_base_slug := 'user';
    end if;

    -- The public handle format allows 40 characters and '-personal' uses 9.
    v_base_slug := left(v_base_slug, 40 - length('-personal'));
    v_slug_attempt := v_base_slug || '-personal';

    while v_attempt < 8 and v_existing_workspace_id is null loop
      begin
        insert into public.workspaces (name, slug, owner_user_id)
        values ('Personal', v_slug_attempt, p_user_id)
        returning id into v_existing_workspace_id;

        v_created_workspace := true;
      exception
        when unique_violation then
          v_attempt := v_attempt + 1;
          -- Keep the retry suffix before '-personal' so the trigger cannot
          -- truncate away the uniqueness component.
          v_slug_attempt :=
            left(v_base_slug, 40 - length('-personal') - 1 - 8)
            || '-' || substring(md5(gen_random_uuid()::text), 1, 8)
            || '-personal';
      end;
    end loop;

    if v_existing_workspace_id is null then
      select w.id
      into v_existing_workspace_id
      from public.workspaces w
      where w.owner_user_id = p_user_id
      order by w.created_at asc
      limit 1;
    end if;
  end if;

  if v_existing_workspace_id is null then
    raise exception using errcode = 'P0001', message = 'personal_workspace_provision_failed';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_existing_workspace_id, p_user_id, 'owner')
  on conflict on constraint workspace_members_pkey do nothing;

  insert into public.workspace_settings (workspace_id)
  values (v_existing_workspace_id)
  on conflict on constraint workspace_settings_pkey do nothing;

  update public.users
  set default_workspace_id = v_existing_workspace_id
  where user_id = p_user_id;

  return query
  select v_existing_workspace_id, v_created_workspace;
end;
$$;

grant execute on function public.provision_personal_workspace(uuid, text) to authenticated, service_role;

-- Rename provisioning key storage to management key storage.
-- Safe to re-run: all operations are guarded.

do $$
begin
  if to_regclass('public.management_keys') is null
     and to_regclass('public.provisioning_keys') is not null then
    alter table public.provisioning_keys rename to management_keys;
  end if;
end
$$;

alter table if exists public.management_keys enable row level security;

do $$
declare
  management_keys_rel regclass := to_regclass('public.management_keys');
begin
  if management_keys_rel is null then
    return;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = management_keys_rel
      and conname = 'provisioning_keys_pkey'
  ) and not exists (
    select 1
    from pg_constraint
    where conrelid = management_keys_rel
      and conname = 'management_keys_pkey'
  ) then
    alter table public.management_keys
      rename constraint provisioning_keys_pkey to management_keys_pkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = management_keys_rel
      and conname = 'provisioning_keys_created_by_fkey'
  ) and not exists (
    select 1
    from pg_constraint
    where conrelid = management_keys_rel
      and conname = 'management_keys_created_by_fkey'
  ) then
    alter table public.management_keys
      rename constraint provisioning_keys_created_by_fkey to management_keys_created_by_fkey;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = management_keys_rel
      and conname = 'provisioning_keys_team_id_fkey'
  ) and not exists (
    select 1
    from pg_constraint
    where conrelid = management_keys_rel
      and conname = 'management_keys_team_id_fkey'
  ) then
    alter table public.management_keys
      rename constraint provisioning_keys_team_id_fkey to management_keys_team_id_fkey;
  end if;
end
$$;

do $$
begin
  if to_regclass('public.provisioning_keys_team_id_idx') is not null
     and to_regclass('public.management_keys_team_id_idx') is null then
    alter index public.provisioning_keys_team_id_idx
      rename to management_keys_team_id_idx;
  end if;

  if to_regclass('public.provisioning_keys_hash_idx') is not null
     and to_regclass('public.management_keys_hash_idx') is null then
    alter index public.provisioning_keys_hash_idx
      rename to management_keys_hash_idx;
  end if;

  if to_regclass('public.provisioning_keys_prefix_idx') is not null
     and to_regclass('public.management_keys_prefix_idx') is null then
    alter index public.provisioning_keys_prefix_idx
      rename to management_keys_prefix_idx;
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'management_keys'
      and policyname = 'provisioning_keys_select_own_team'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'management_keys'
      and policyname = 'management_keys_select_own_team'
  ) then
    alter policy provisioning_keys_select_own_team
      on public.management_keys
      rename to management_keys_select_own_team;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'management_keys'
      and policyname = 'provisioning_keys_insert_own_team'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'management_keys'
      and policyname = 'management_keys_insert_own_team'
  ) then
    alter policy provisioning_keys_insert_own_team
      on public.management_keys
      rename to management_keys_insert_own_team;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'management_keys'
      and policyname = 'provisioning_keys_update_own_team'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'management_keys'
      and policyname = 'management_keys_update_own_team'
  ) then
    alter policy provisioning_keys_update_own_team
      on public.management_keys
      rename to management_keys_update_own_team;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'management_keys'
      and policyname = 'provisioning_keys_delete_own_team'
  ) and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'management_keys'
      and policyname = 'management_keys_delete_own_team'
  ) then
    alter policy provisioning_keys_delete_own_team
      on public.management_keys
      rename to management_keys_delete_own_team;
  end if;
end
$$;

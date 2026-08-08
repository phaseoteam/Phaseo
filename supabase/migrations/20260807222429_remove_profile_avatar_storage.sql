do $$
begin
  if exists (
    select 1
    from storage.objects
    where bucket_id = 'profile-avatars'
  ) then
    raise exception 'profile-avatars still contains objects; migrate them before removing the bucket';
  end if;
end
$$;

drop policy if exists profile_avatars_select_own on storage.objects;
drop policy if exists profile_avatars_insert_own on storage.objects;
drop policy if exists profile_avatars_update_own on storage.objects;
drop policy if exists profile_avatars_delete_own on storage.objects;

-- Supabase protects storage bucket deletion at the SQL layer. Production is
-- removed through the Storage API; other environments retain an empty,
-- inaccessible bucket until their normal infrastructure cleanup runs.

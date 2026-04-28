-- Allow management keys to expire on a schedule.
alter table if exists public.management_keys
  add column if not exists expires_at timestamptz null;

do $$
begin
  if to_regclass('public.management_keys') is not null then
    execute 'create index if not exists management_keys_expires_at_idx on public.management_keys (expires_at) where expires_at is not null';
  end if;
end;
$$;

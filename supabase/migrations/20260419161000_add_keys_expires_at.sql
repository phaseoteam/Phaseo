-- Allow key rotation with scheduled sunset of previous keys.
alter table if exists public.keys
  add column if not exists expires_at timestamptz null;

create index if not exists keys_expires_at_idx
  on public.keys (expires_at)
  where expires_at is not null;

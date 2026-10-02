-- Keep labeled IP policies with their key; existing key RLS governs writes.
create or replace function public.valid_key_ip_allowlist(entries jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  entry jsonb;
  address text;
begin
  if entries is null or jsonb_typeof(entries) <> 'array' then return false; end if;
  if jsonb_array_length(entries) > 100 then return false; end if;
  for entry in select value from jsonb_array_elements(entries) loop
    if jsonb_typeof(entry) <> 'object'
      or jsonb_typeof(entry->'label') is distinct from 'string'
      or jsonb_typeof(entry->'address') is distinct from 'string'
      or length(btrim(entry->>'label')) not between 1 and 100
    then return false; end if;
    address := entry->>'address';
    -- Require full dotted IPv4 or IPv6, with an optional prefix length.
    if address !~ '^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,3})?$'
      and address !~ '^[0-9A-Fa-f:.]+:[0-9A-Fa-f:.]*(/[0-9]{1,3})?$'
    then return false; end if;
    perform address::inet;
  end loop;
  return true;
exception when invalid_text_representation then return false;
end;
$$;

alter table public.keys
  add column ip_allowlist jsonb not null default '[]'::jsonb,
  add constraint keys_ip_allowlist_valid check (public.valid_key_ip_allowlist(ip_allowlist));

comment on column public.keys.ip_allowlist is
  'Labeled IPv4/IPv6 addresses or CIDRs allowed to use this key. Empty permits any IP.';

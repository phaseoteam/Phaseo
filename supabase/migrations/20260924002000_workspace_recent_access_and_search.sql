create extension if not exists pg_trgm with schema extensions;

alter table public.workspace_members
  add column if not exists last_accessed_at timestamptz;

create index if not exists workspace_members_user_recent_access_idx
  on public.workspace_members (user_id, last_accessed_at desc nulls last, workspace_id);

do $$
declare
  trigram_schema text;
begin
  select nsp.nspname
    into trigram_schema
  from pg_opclass opc
  join pg_namespace nsp on nsp.oid = opc.opcnamespace
  join pg_am am on am.oid = opc.opcmethod
  where opc.opcname = 'gin_trgm_ops'
    and am.amname = 'gin'
  order by (nsp.nspname = 'extensions') desc, (nsp.nspname = 'public') desc
  limit 1;

  if trigram_schema is null then
    raise exception 'pg_trgm gin_trgm_ops operator class is unavailable';
  end if;

  execute format(
    'create index if not exists workspaces_name_trgm_search_idx on public.workspaces using gin (name %I.gin_trgm_ops)',
    trigram_schema
  );
end
$$;

comment on column public.workspace_members.last_accessed_at is
  'Most recent time this member selected the workspace in the Phaseo web app.';

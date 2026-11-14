-- Cluster roles that declarative schema files grant to.
--
-- Supabase CLI runs this file before loading migrations or declarative schemas into
-- local and shadow databases. Roles are cluster objects, so schema files can only
-- reference them. scripts/declarative-schema.mjs copies this file into its disposable
-- workspace. Production gets these roles from the forward migrations named below.
--
-- Mirror each role's definition exactly. No passwords or LOGIN here; grants belong in
-- the schema files and migrations.

-- 20261112152648_gateway_smoke_reader_role.sql
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'gateway_smoke_reader') then
    create role gateway_smoke_reader nologin bypassrls noinherit connection limit 3;
  end if;
end
$$;

alter role gateway_smoke_reader set default_transaction_read_only = on;
alter role gateway_smoke_reader set statement_timeout = '15s';
alter role gateway_smoke_reader set idle_in_transaction_session_timeout = '30s';

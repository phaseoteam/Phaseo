import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table public.users (
      user_id uuid primary key, role text not null default 'user', display_name text,
      default_workspace_id uuid, obfuscate_info boolean, created_at timestamptz,
      updated_at timestamptz, beta_opt_in boolean, beta_features jsonb,
      public_profile_enabled boolean, public_profile_slug text, onboarding_state jsonb,
      onboarding_completed_at timestamptz, declared_country_code text, country_declared_at timestamptz
    );
    alter table public.users enable row level security;
    create policy self on public.users to authenticated
      using (user_id = current_setting('test.uid')::uuid)
      with check (user_id = current_setting('test.uid')::uuid);
    grant all on public.users to authenticated, service_role;
    grant insert(role),update(role) on public.users to authenticated;
    select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);
  `);
  const migration = await readFile(new URL('../migrations/20260907233146_protect_platform_role_assignment.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration);
  await db.exec('set role authenticated');
  await assert.rejects(db.exec(`insert into public.users(user_id,role) values(current_setting('test.uid')::uuid,'admin')`), /permission denied/);
  await db.exec(`insert into public.users(user_id,display_name) values(current_setting('test.uid')::uuid,'Profile'); update public.users set display_name='Changed'`);
  await assert.rejects(db.exec(`update public.users set role='admin'`), /permission denied/);
  assert.deepEqual((await db.query('select role,display_name from public.users')).rows, [{role:'user',display_name:'Changed'}]);
  await db.exec('reset role; set role service_role');
  await db.exec(`update public.users set role='admin'`);
  assert.equal((await db.query('select role from public.users')).rows[0].role,'admin');
  console.log('Platform role: direct INSERT/UPDATE denied, profile writes preserved, backend assignment allowed.');
} finally { await db.close(); }

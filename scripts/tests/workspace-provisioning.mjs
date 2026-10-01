import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create table users(user_id uuid primary key,display_name text,default_workspace_id uuid);
create table workspaces(id uuid primary key default gen_random_uuid(),name text,slug text unique,owner_user_id uuid,created_at timestamptz default now(),publisher_handle text);
create table workspace_members(workspace_id uuid,user_id uuid,role text,primary key(workspace_id,user_id));
create table workspace_settings(workspace_id uuid primary key);`);
for (const file of ['20260909135416_fix_personal_workspace_publisher_handle_length.sql','20260909144137_restore_personal_workspace_provisioning_permissions.sql']) await db.exec(readFileSync(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
for (const role of ['anon','authenticated']) {
 await db.exec('set role '+role);
 await assert.rejects(()=>db.query("select * from provision_personal_workspace('00000000-0000-4000-8000-000000000001','Someone else')"), /permission denied/);
 await db.exec('reset role');
}
await db.exec('set role service_role');
const result=await db.query("select * from provision_personal_workspace('00000000-0000-4000-8000-000000000001',$1)",['A very long display name that exceeds forty characters for the provisioning regression test']);
assert.equal(result.rows[0].created_workspace,true);
await db.exec('reset role');
const workspace=(await db.query('select * from workspaces')).rows[0];
assert.ok(workspace.publisher_handle.length<=40);
console.log('PASS browser provisioning denied; backend provisioning and bounded handles preserved.');
await db.close();

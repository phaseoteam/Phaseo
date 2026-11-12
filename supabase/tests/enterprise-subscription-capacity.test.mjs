import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
try {
  await db.exec(`create schema private;
    create table public.workspace_members(workspace_id uuid, user_id uuid);
    create table public.workspace_addon_subscriptions(workspace_id uuid, addon_key text, included_members integer, status text, grace_until timestamptz);
    insert into public.workspace_members values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
      ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002');`);
  await db.exec(await readFile(new URL('../schemas/private/functions/enforce_workspace_enterprise_subscription_capacity.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../schemas/private/functions/enforce_workspace_enterprise_member_capacity.sql', import.meta.url), 'utf8'));
  await db.exec(`create trigger subscription_capacity before insert or update on public.workspace_addon_subscriptions for each row execute function private.enforce_workspace_enterprise_subscription_capacity();
    create trigger member_capacity before insert on public.workspace_members for each row execute function private.enforce_workspace_enterprise_member_capacity();`);
  const insert = (count, status = 'active') => db.query(`insert into public.workspace_addon_subscriptions values ('10000000-0000-4000-8000-000000000001','identity',$1,$2,now()+interval '1 day')`, [count,status]);
  await assert.rejects(insert(1), /workspace_enterprise_member_limit_reached/);
  await insert(2);
  await assert.rejects(db.exec(`update public.workspace_addon_subscriptions set included_members=1`), /workspace_enterprise_member_limit_reached/);
  await assert.rejects(db.exec(`insert into public.workspace_members values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003')`), /workspace_enterprise_member_limit_reached/);
  await db.exec(`update public.workspace_addon_subscriptions set included_members=3`);
  await db.exec(`insert into public.workspace_members values ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003')`);
  await db.exec(`update public.workspace_addon_subscriptions set included_members=1,status='canceled'`);
  await assert.rejects(db.exec(`update public.workspace_addon_subscriptions set status='past_due'`), /workspace_enterprise_member_limit_reached/);
  await db.exec(`update public.workspace_addon_subscriptions set included_members=100000,status='active'`);
  console.log('Capacity: activation and downgrade blocked; matching capacity, growth, inactive and unlimited plans retained.');
} finally { await db.close(); }

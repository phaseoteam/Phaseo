import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const workspace = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const insert = (type, owner = workspace) => db.query(
    `insert into public.workspace_broadcast_destinations(workspace_id,destination_id,name) values($1,$2,'d') returning id`,
    [owner, type],
);
const limitReached = /broadcast_destination_limit_reached/;
try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      grant usage on schema public to anon, authenticated, service_role;
      create table public.workspaces(id uuid primary key);
      create function public.is_workspace_admin(uuid) returns boolean language sql as 'select true';
      create function public.set_updated_at_if_changed() returns trigger language plpgsql as 'begin new.updated_at = now(); return new; end';
    `);
    await db.exec(await read('../schemas/public/functions/enforce_broadcast_destination_limit.sql'));
    await db.exec(await read('../schemas/public/tables/workspace_broadcast_destination_limits.sql'));
    await db.exec(await read('../schemas/public/tables/workspace_broadcast_destinations.sql'));
    await db.query('insert into public.workspaces values($1),($2)', [workspace, other]);

    // Default: five per workspace and type.
    for (let index = 0; index < 5; index++) await insert('webhook');
    await assert.rejects(insert('webhook'), limitReached);
    await insert('otel_collector');
    await insert('webhook', other);

    // Moving a row into a full type is capped; other edits are not.
    const otel = (await db.query(`select id from public.workspace_broadcast_destinations where destination_id = 'otel_collector'`)).rows[0].id;
    await assert.rejects(db.query(`update public.workspace_broadcast_destinations set destination_id = 'webhook' where id = $1`, [otel]), limitReached);
    await db.query(`update public.workspace_broadcast_destinations set name = 'renamed' where workspace_id = $1`, [workspace]);

    // An operator override raises the cap for that workspace only.
    await db.query('insert into public.workspace_broadcast_destination_limits(workspace_id,max_destinations_per_type) values($1,6)', [workspace]);
    await insert('webhook');
    await assert.rejects(insert('webhook'), limitReached);
    await assert.rejects(db.query('insert into public.workspace_broadcast_destination_limits(workspace_id,max_destinations_per_type) values($1,0)', [other]), /check/);

    // Admins inserting through RLS hit the same cap and cannot see or change overrides.
    await db.exec('set role authenticated');
    await assert.rejects(insert('webhook'), limitReached);
    await assert.rejects(db.query('select * from public.workspace_broadcast_destination_limits'), /permission denied/);
    await assert.rejects(db.query('update public.workspace_broadcast_destination_limits set max_destinations_per_type = 1000'), /permission denied/);
    await db.exec('reset role');

    console.log('broadcast destination limit: ok');
} finally {
    await db.close();
}

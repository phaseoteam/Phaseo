import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create function public.gateway_fetch_request_context(uuid,text,text,uuid)
    returns jsonb language sql security definer as $$select '{"private_context":true}'::jsonb$$;
    grant execute on function public.gateway_fetch_request_context(uuid,text,text,uuid) to authenticated,service_role;
  `);
  const migration = await readFile(new URL('../migrations/20260907225711_harden_gateway_context_access.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query(`select public.gateway_fetch_request_context(null,null,null,null)`), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const result = await db.query(`select public.gateway_fetch_request_context(null,null,null,null) payload`);
  assert.deepEqual(result.rows[0].payload, { private_context: true });
  console.log('Gateway context: anonymous/authenticated denied, service role retained, migration idempotent.');
} finally {
  await db.close();
}

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const migration = await readFile(new URL('../migrations/20261008154500_remove_redundant_routing_prune.sql', import.meta.url), 'utf8');

// Fresh replays of main have no pg_cron job or prune function; the migration must be a no-op.
const fresh = new PGlite();
try {
  await fresh.exec('create schema private;');
  await fresh.exec(migration);
  await fresh.exec(migration);
} finally {
  await fresh.close();
}

// Production carries the job and function from migrations applied outside main.
const db = new PGlite();
try {
  await db.exec(`
    create schema private; create schema cron;
    create table cron.job(jobid bigint primary key, jobname text unique, command text);
    create function cron.unschedule(p_jobid bigint) returns boolean language sql as
      'delete from cron.job where jobid = p_jobid returning true';
    insert into cron.job values
      (23, 'provider-health-refresh-queue', 'select private.drain_provider_health_refresh(500);'),
      (26, 'prune-routing-decision-details', 'select private.prune_routing_decision_details(500);'),
      (27, 'prune-completed-analytics-outbox', 'select private.prune_completed_analytics_outbox(500);');
    create function private.prune_routing_decision_details(p_batch_size integer default 500)
      returns integer language sql as 'select 0';
  `);
  await db.exec(migration);
  await db.exec(migration);
  const jobs = (await db.query('select jobname from cron.job order by jobid')).rows.map(row => row.jobname);
  assert.deepEqual(jobs, ['provider-health-refresh-queue', 'prune-completed-analytics-outbox'],
    'only the routing prune job is unscheduled');
  const fn = (await db.query(`select to_regprocedure('private.prune_routing_decision_details(integer)') oid`)).rows[0];
  assert.equal(fn.oid, null, 'prune function is dropped');
} finally {
  await db.close();
}
console.log('routing prune removal: ok');

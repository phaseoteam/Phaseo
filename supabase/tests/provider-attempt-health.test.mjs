import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrationPath = '../migrations/20261104163425_provider_attempt_health_classes.sql';
const workspace = '40000000-0000-4000-8000-000000000002';
const tableSection = (sql, needle) => {
  const line = sql.split(/\r?\n/).find((value) => value.includes(needle));
  assert.ok(line, `missing ${needle}`);
  return line.trim();
};
try {
  const migration = await read(migrationPath);
  const desiredTable = await read('../schemas/public/tables/v2_request_attempts.sql');
  assert.ok(migration.includes('\nSET local check_function_bodies = off;\n'));
  assert.ok(!/\b(drop|truncate)\b|\bdelete\s+from\b/i.test(migration), 'the migration must not be destructive');
  // The declarative function now matches the follow-up migration
  // (20261104194200_provider_attempt_health_reasons, see provider-attempt-health-reasons.test.mjs).
  assert.ok(migration.includes(tableSection(desiredTable, 'v2_request_attempts_health_class_check').replace(/,$/, '')),
    'migration check constraint must match the declarative table');

  for (const path of ['./fixtures/staged-reporting-before.sql',
    '../migrations/20261009114400_exclude_staged_models_from_public_reporting.sql',
    '../migrations/20261009114619_align_staged_reporting_function_definitions.sql']) {
    await db.exec(await read(path));
  }
  await db.exec(`
    alter table v2_request_facts alter column request_event_id set default gen_random_uuid();
    alter table v2_request_attempts alter column attempt_id set default gen_random_uuid();
    create table v2_model_aliases(alias_slug text, model_slug text, enabled boolean);
    insert into v2_models(model_slug,hidden,status,released_at,updated_at) values
      ('fixture/model',false,'active','2026-08-01','2026-10-01');
    insert into v2_providers(provider_slug,name) values ('fixture','Fixture'),('backup','Backup'),('stealthy','Stealthy');
    insert into v2_model_provider_routes(provider_model_id,model_slug,provider_slug,provider_model_slug,
      status,routing_enabled,access_scope,phaseo_status,is_stealth,provider_availability_status,updated_at) values
      ('fixture:model','fixture/model','fixture','model','active',true,'public','enabled',false,'available','2026-10-01'),
      ('backup:model','fixture/model','backup','model','active',true,'public','enabled',false,'available','2026-10-01'),
      ('stealthy:model','fixture/model','stealthy','model','active',true,'public','enabled',true,'available','2026-10-01');
  `);
  await db.exec(await read('../migrations/20261104152910_pricing_lines_record_charged_sku_meter.sql'));
  await db.exec(migration);

  const occurredAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const attempt = (provider, fields = {}) => ({
    provider, provider_model_id: `${provider}:model`, provider_api_model_id: 'model',
    success: false, failure_class: 'upstream_non_2xx', error_code: 'upstream_non_2xx', key_source: 'gateway', ...fields,
  });
  const ok = (provider, fields = {}) => attempt(provider, { success: true, status_code: 200,
    failure_class: null, error_code: null, ...fields });
  const ingest = async (id, attempts, overrides = {}) => {
    const served = [...attempts].reverse().find((value) => value.success);
    await db.query('select ingest_v2_gateway_request($1::jsonb)', [JSON.stringify({
      workspace_id: workspace, request_id: id, occurred_at: occurredAt,
      requested_model_input: 'fixture/model', routed_model_slug: 'fixture/model',
      provider: (served ?? attempts.at(-1)).provider,
      provider_model_id: `${(served ?? attempts.at(-1)).provider}:model`,
      success: Boolean(served), status_code: served ? 200 : 502,
      safe_metadata: { testing_mode: false }, attempts, ...overrides,
    })]);
  };

  // Classified by the gateway.
  await ingest('failover', [attempt('fixture', { status_code: 503, health_class: 'reachability' }),
    ok('backup', { health_class: 'success' })]);
  await ingest('broken-stream', [ok('fixture', { health_class: 'call_error' })],
    { success: false, status_code: 502, error_code: 'upstream:upstream_stream_failure' });
  await ingest('served', [ok('fixture', { health_class: 'success' })]);
  await ingest('bogus-class', [ok('fixture', { health_class: 'bogus' })]);
  await ingest('hidden-route', [attempt('stealthy', { status_code: 500, health_class: 'call_error' }),
    ok('backup', { health_class: 'success' })]);
  // Recorded before the gateway classified attempts: derived from what was stored.
  await ingest('legacy-429', [attempt('fixture', { status_code: 429 })], { success: false, status_code: 429 });
  await ingest('legacy-byok-429', [attempt('fixture', { status_code: 429, key_source: 'byok' })], { success: false, status_code: 429 });
  await ingest('legacy-400', [attempt('fixture', { status_code: 400 })], { success: false, status_code: 400 });
  await ingest('legacy-401', [attempt('fixture', { status_code: 401 })], { success: false, status_code: 502 });
  await ingest('legacy-stream', [ok('fixture')],
    { success: false, status_code: 502, error_code: 'upstream:upstream_stream_failure' });
  await ingest('legacy-cancel', [ok('fixture')],
    { success: false, status_code: 499, error_code: 'client:client_closed_request' });

  const stored = (await db.query(`
    select fact.request_id, attempt.attempt_number, attempt.health_class
    from v2_request_attempts attempt join v2_request_facts fact using (request_event_id)
    where fact.request_id in ('failover','bogus-class','legacy-429') order by 1, 2`)).rows;
  assert.deepEqual(stored, [
    { request_id: 'bogus-class', attempt_number: 1, health_class: null },
    { request_id: 'failover', attempt_number: 1, health_class: 'reachability' },
    { request_id: 'failover', attempt_number: 2, health_class: 'success' },
    { request_id: 'legacy-429', attempt_number: 1, health_class: null },
  ], 'ingest stores known classes and drops unknown ones');
  await assert.rejects(db.query(`update v2_request_attempts set health_class = 'flaky'`), /health_class_check/);

  const rows = async () => (await db.query(
    'select * from public.get_v2_model_provider_attempt_health($1, 3)', ['fixture/model'])).rows;
  const byProvider = Object.fromEntries((await rows()).map((row) => [row.provider_id, row]));
  assert.deepEqual(Object.keys(byProvider).sort(), ['backup', 'fixture'], 'stealth routes are never reported');

  const fixture = byProvider.fixture;
  assert.equal(fixture.provider_name, 'Fixture');
  assert.equal(fixture.service_tier, 'standard');
  const counts = Object.fromEntries(['attempts', 'eligible_attempts', 'success_attempts', 'reachability_failures',
    'capacity_failures', 'call_error_failures', 'customer_excluded', 'phaseo_excluded'].map((key) => [key, Number(fixture[key])]));
  // A failover still counts against the provider that failed; customer and Phaseo
  // attempts are excluded from the denominator.
  assert.deepEqual(counts, {
    attempts: 10, eligible_attempts: 6, success_attempts: 2, reachability_failures: 1,
    capacity_failures: 1, call_error_failures: 2, customer_excluded: 3, phaseo_excluded: 1,
  });
  assert.equal(Number(fixture.reachability_pct), 83.33);
  assert.equal(Number(fixture.capacity_pct), 83.33);
  assert.equal(Number(fixture.call_error_pct), 66.67);
  assert.equal(Number(fixture.uptime_pct), 33.33);
  assert.equal(fixture.buckets.length, 1);
  assert.equal(fixture.buckets[0].eligible_attempts, 6);
  assert.equal(Number(fixture.buckets[0].call_error_pct), 66.67);
  assert.equal(Number(byProvider.backup.attempts), 2);
  assert.equal(Number(byProvider.backup.reachability_pct), 100);

  // Customer-only hours have no eligible attempts and no rates.
  await db.exec(`delete from v2_request_attempts where provider_model_id = 'fixture:model'
    and request_event_id not in (select request_event_id from v2_request_facts where request_id in ('legacy-400','legacy-byok-429'))`);
  const customerOnly = (await rows()).find((row) => row.provider_id === 'fixture');
  assert.equal(Number(customerOnly.eligible_attempts), 0);
  assert.equal(customerOnly.reachability_pct, null);
  assert.equal(customerOnly.buckets[0].uptime_pct, null);

  // Hidden or disabled models report nothing; facts excluded from public reporting do not count.
  await db.exec(`update v2_models set hidden = true where model_slug = 'fixture/model'`);
  assert.equal((await rows()).length, 0);
  await db.exec(`update v2_models set hidden = false, status = 'disabled' where model_slug = 'fixture/model'`);
  assert.equal((await rows()).length, 0);
  await db.exec(`update v2_models set status = 'active' where model_slug = 'fixture/model';
    update v2_request_facts set safe_metadata = safe_metadata || '{"testing_mode":"true"}'::jsonb`);
  assert.equal((await db.query('select count(*) filter (where public_reporting_allowed)::int n from v2_request_facts')).rows[0].n, 0);
  assert.equal((await rows()).length, 0);

  const privileges = (await db.query(`select
    has_function_privilege('service_role', 'public.get_v2_model_provider_attempt_health(text,integer)', 'execute') service,
    has_function_privilege('anon', 'public.get_v2_model_provider_attempt_health(text,integer)', 'execute') anon,
    has_function_privilege('authenticated', 'public.get_v2_model_provider_attempt_health(text,integer)', 'execute') authed`)).rows[0];
  assert.deepEqual(privileges, { service: true, anon: false, authed: false });

  console.log('Attempts store their provider health class; model pages get per-attempt reachability, capacity and call-error rates');
} finally { await db.close(); }

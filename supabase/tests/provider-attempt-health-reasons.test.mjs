import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrationPath = '../migrations/20261104194200_provider_attempt_health_reasons.sql';
const workspace = '40000000-0000-4000-8000-000000000003';
const functionNames = [
  'get_v2_model_provider_attempt_health_rows',
  'get_v2_model_provider_attempt_health',
  'get_v2_model_provider_attempt_health_reasons',
];
const functionBody = (sql, name) => {
  const create = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name} (`);
  assert.ok(create >= 0, `missing CREATE for ${name}`);
  const start = sql.indexOf('$function$', create) + '$function$'.length;
  return sql.slice(start, sql.indexOf('$function$', start)).replaceAll('\r\n', '\n');
};
const tableLine = (sql, needle) => {
  const line = sql.split(/\r?\n/).find((value) => value.includes(needle));
  assert.ok(line, `missing ${needle}`);
  return line.trim().replace(/,$/, '');
};
try {
  const migration = await read(migrationPath);
  const desiredTable = await read('../schemas/public/tables/v2_request_attempts.sql');
  assert.ok(migration.includes('\nSET local check_function_bodies = off;\n'));
  assert.ok(!/\b(drop|truncate)\b|\bdelete\s+from\b/i.test(migration), 'the migration must not be destructive');
  for (const name of functionNames) {
    const desired = await read(`../schemas/public/functions/${name}.sql`);
    assert.equal(functionBody(migration, name), functionBody(desired, name), `${name}: migration body must match the declarative function`);
    for (const statement of desired.split(/\r?\n/).filter((line) => /^(GRANT|REVOKE|COMMENT)/.test(line))) {
      assert.ok(migration.includes(statement), `migration must include: ${statement}`);
    }
  }
  assert.ok(migration.includes(tableLine(desiredTable, 'v2_request_attempts_health_reason_check')),
    'migration check constraint must match the declarative table');
  assert.ok(migration.includes(tableLine(desiredTable, 'COMMENT ON COLUMN "public"."v2_request_attempts"."health_reason"')),
    'migration column comment must match the declarative table');
  const manifest = JSON.parse(await read('../schemas/.pgdelta-export.json'));
  for (const name of functionNames) {
    const path = `public/functions/${name}.sql`;
    assert.ok(manifest.loadOrder.includes(path) && manifest.files.includes(path), `${path} must be in the manifest`);
  }
  assert.ok(manifest.loadOrder.indexOf('public/functions/get_v2_model_provider_attempt_health_rows.sql')
    < manifest.loadOrder.indexOf('public/functions/get_v2_model_provider_attempt_health.sql'), 'rows load before the rates');

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
    insert into v2_providers(provider_slug,name) values ('fixture','Fixture'),('backup','Backup');
    insert into v2_model_provider_routes(provider_model_id,model_slug,provider_slug,provider_model_slug,
      status,routing_enabled,access_scope,phaseo_status,is_stealth,provider_availability_status,updated_at) values
      ('fixture:model','fixture/model','fixture','model','active',true,'public','enabled',false,'available','2026-10-01'),
      ('backup:model','fixture/model','backup','model','active',true,'public','enabled',false,'available','2026-10-01');
  `);
  await db.exec(await read('../migrations/20261104152910_pricing_lines_record_charged_sku_meter.sql'));
  await db.exec(await read('../migrations/20261104163425_provider_attempt_health_classes.sql'));
  await db.exec(migration);
  // The ingest patch is guarded: running it twice fails rather than double-patching.
  await assert.rejects(db.exec(migration), /already installed|already exists/);

  // Every request gets its own second inside one hour two hours ago, so rows can be
  // traced back to their request through occurred_at and all land in one bucket.
  const hourStart = Math.floor((Date.now() - 2 * 3_600_000) / 3_600_000) * 3_600_000;
  let requestCount = 0;
  const attempt = (provider, fields = {}) => ({
    provider, provider_model_id: `${provider}:model`, provider_api_model_id: 'model',
    success: false, failure_class: 'upstream_non_2xx', error_code: 'upstream_non_2xx', key_source: 'gateway', ...fields,
  });
  const ok = (provider, fields = {}) => attempt(provider, { success: true, status_code: 200,
    failure_class: null, error_code: null, ...fields });
  const ingest = async (id, attempts, overrides = {}) => {
    const served = [...attempts].reverse().find((value) => value.success);
    requestCount += 1;
    await db.query('select ingest_v2_gateway_request($1::jsonb)', [JSON.stringify({
      workspace_id: workspace, request_id: id, occurred_at: new Date(hourStart + 600_000 + requestCount * 1000).toISOString(),
      requested_model_input: 'fixture/model', routed_model_slug: 'fixture/model',
      provider: (served ?? attempts.at(-1)).provider,
      provider_model_id: `${(served ?? attempts.at(-1)).provider}:model`,
      success: Boolean(served), status_code: served ? 200 : 502,
      safe_metadata: { testing_mode: false }, attempts, ...overrides,
    })]);
  };

  // Classified by the gateway, with reasons.
  await ingest('gw-accepted-elsewhere', [
    attempt('fixture', { status_code: 400, health_class: 'phaseo', health_reason: 'provider_rejected_request_accepted_elsewhere' }),
    ok('backup', { health_class: 'success' })]);
  await ingest('gw-model-404', [attempt('fixture', { status_code: 404, health_class: 'phaseo', health_reason: 'route_model_not_found' })],
    { success: false, status_code: 404 });
  await ingest('gw-rate', [attempt('fixture', { status_code: 429, health_class: 'capacity', health_reason: 'rate_limited' })],
    { success: false, status_code: 429 });
  await ingest('gw-bad-reason', [ok('fixture', { health_class: 'success', health_reason: 'Bad Reason!' })]);
  await ingest('gw-reason-no-class', [ok('backup', { health_reason: 'stream_break' })]);
  // Recorded before the gateway classified attempts: derived from what was stored.
  await ingest('legacy-400-elsewhere', [attempt('fixture', { status_code: 400 }), ok('backup')]);
  await ingest('legacy-400-alone', [attempt('fixture', { status_code: 400 })], { success: false, status_code: 400 });
  await ingest('legacy-400-same-route', [attempt('fixture', { status_code: 400 }), ok('fixture')]);
  await ingest('legacy-byok-401-elsewhere', [attempt('fixture', { status_code: 401, key_source: 'byok' }), ok('backup')]);
  await ingest('legacy-404', [attempt('fixture', { status_code: 404 })], { success: false, status_code: 404 });
  await ingest('legacy-503', [attempt('fixture', { status_code: 503 })], { success: false, status_code: 503 });
  await ingest('legacy-500', [attempt('fixture', { status_code: 500 })], { success: false, status_code: 500 });
  await ingest('legacy-ok', [ok('fixture')]);
  // Recorded with a class but no reason (between the two gateway releases).
  await ingest('between-400-elsewhere', [attempt('fixture', { status_code: 400, health_class: 'customer' }),
    ok('backup', { health_class: 'success' })]);
  await ingest('between-customer-404', [attempt('fixture', { status_code: 404, health_class: 'customer' })],
    { success: false, status_code: 404 });

  const stored = (await db.query(`
    select fact.request_id, attempt.attempt_number, attempt.health_class, attempt.health_reason
    from v2_request_attempts attempt join v2_request_facts fact using (request_event_id)
    where fact.request_id like 'gw-%' order by 1, 2`)).rows;
  assert.deepEqual(stored, [
    { request_id: 'gw-accepted-elsewhere', attempt_number: 1, health_class: 'phaseo', health_reason: 'provider_rejected_request_accepted_elsewhere' },
    { request_id: 'gw-accepted-elsewhere', attempt_number: 2, health_class: 'success', health_reason: null },
    { request_id: 'gw-bad-reason', attempt_number: 1, health_class: 'success', health_reason: null },
    { request_id: 'gw-model-404', attempt_number: 1, health_class: 'phaseo', health_reason: 'route_model_not_found' },
    { request_id: 'gw-rate', attempt_number: 1, health_class: 'capacity', health_reason: 'rate_limited' },
    { request_id: 'gw-reason-no-class', attempt_number: 1, health_class: null, health_reason: null },
  ], 'ingest stores well-formed reasons with a known class and drops the rest');
  await assert.rejects(db.query(`update v2_request_attempts set health_reason = 'Not A Reason'`), /health_reason_check/);

  // Per-attempt classification, including rows recorded without a class or reason.
  // The rows carry no request id; each request has its own occurred_at.
  const perRequest = {};
  for (const row of (await db.query(`
    select fact.request_id, attempt.provider_id, attempt.health_class, attempt.health_reason
    from public.get_v2_model_provider_attempt_health_rows('fixture/model', 3) attempt
    join v2_request_facts fact on fact.occurred_at = attempt.occurred_at
    order by 1, 2, 3`)).rows) {
    (perRequest[row.request_id] ??= []).push(`${row.provider_id}:${row.health_class}:${row.health_reason ?? '-'}`);
  }
  assert.deepEqual(perRequest, {
    'gw-accepted-elsewhere': ['backup:success:-', 'fixture:phaseo:provider_rejected_request_accepted_elsewhere'],
    'gw-bad-reason': ['fixture:success:-'],
    'gw-model-404': ['fixture:phaseo:route_model_not_found'],
    'gw-rate': ['fixture:capacity:rate_limited'],
    'gw-reason-no-class': ['backup:success:-'],
    // A 4xx that another route then accepted: Phaseo's routing or mapping problem.
    'legacy-400-elsewhere': ['backup:success:-', 'fixture:phaseo:provider_rejected_request_accepted_elsewhere'],
    'legacy-400-alone': ['fixture:customer:invalid_request'],
    // The same route accepting it on retry is not evidence against the route.
    'legacy-400-same-route': ['fixture:customer:invalid_request', 'fixture:success:-'],
    // The customer's own key stays the customer's even when another route served.
    'legacy-byok-401-elsewhere': ['backup:success:-', 'fixture:customer:byok_error'],
    'legacy-404': ['fixture:phaseo:route_model_not_found'],
    'legacy-503': ['fixture:reachability:upstream_unavailable'],
    'legacy-500': ['fixture:call_error:server_error'],
    'legacy-ok': ['fixture:success:-'],
    'between-400-elsewhere': ['backup:success:-', 'fixture:phaseo:provider_rejected_request_accepted_elsewhere'],
    // A recorded class wins over a disagreeing derived one; its reason is then unknown.
    'between-customer-404': ['fixture:customer:-'],
  });

  // Rates: a funnel over the eligible attempts.
  const rates = async () => Object.fromEntries((await db.query(
    'select * from public.get_v2_model_provider_attempt_health($1, 3)', ['fixture/model'])).rows.map((row) => [row.provider_id, row]));
  const fixture = (await rates()).fixture;
  const counts = Object.fromEntries(['attempts', 'eligible_attempts', 'success_attempts', 'reachability_failures',
    'capacity_failures', 'call_error_failures', 'customer_excluded', 'phaseo_excluded'].map((key) => [key, Number(fixture[key])]));
  assert.deepEqual(counts, {
    attempts: 15, eligible_attempts: 6, success_attempts: 3, reachability_failures: 1,
    capacity_failures: 1, call_error_failures: 1, customer_excluded: 4, phaseo_excluded: 5,
  });
  // 6 eligible; 5 reached the provider; 4 were accepted; 3 completed.
  assert.equal(Number(fixture.reachability_pct), 83.33);
  assert.equal(Number(fixture.capacity_pct), 80);
  assert.equal(Number(fixture.call_error_pct), 75);
  assert.equal(Number(fixture.uptime_pct), 50);
  assert.equal(fixture.buckets.length, 1);
  assert.equal(Number(fixture.buckets[0].capacity_pct), 80);
  assert.equal(Number(fixture.buckets[0].call_error_pct), 75);

  // Reasons, for internal use: what went wrong per provider, class and reason.
  const reasons = (await db.query(`select provider_id, health_class, health_reason, attempts::int
    from public.get_v2_model_provider_attempt_health_reasons('fixture/model', 3) where provider_id = 'fixture'
    order by health_class, health_reason`)).rows
    .map((row) => `${row.health_class}:${row.health_reason}:${row.attempts}`);
  assert.deepEqual(reasons, [
    'call_error:server_error:1',
    'capacity:rate_limited:1',
    'customer:byok_error:1',
    'customer:invalid_request:2',
    'customer:unclassified:1',
    'phaseo:provider_rejected_request_accepted_elsewhere:3',
    'phaseo:route_model_not_found:2',
    'reachability:upstream_unavailable:1',
  ]);

  // A provider whose attempts reached it but were all turned away has no completed rate.
  await db.exec(`update v2_request_facts set safe_metadata = safe_metadata || '{"testing_mode":"true"}'::jsonb
    where request_id <> 'gw-rate'`);
  const capacityOnly = (await rates()).fixture;
  assert.equal(Number(capacityOnly.reachability_pct), 100);
  assert.equal(Number(capacityOnly.capacity_pct), 0);
  assert.equal(capacityOnly.call_error_pct, null);

  for (const name of functionNames) {
    const privileges = (await db.query(`select
      has_function_privilege('service_role', 'public.${name}(text,integer)', 'execute') service,
      has_function_privilege('anon', 'public.${name}(text,integer)', 'execute') anon,
      has_function_privilege('authenticated', 'public.${name}(text,integer)', 'execute') authed`)).rows[0];
    assert.deepEqual(privileges, { service: true, anon: false, authed: false }, name);
  }

  console.log('Attempts store why they got their health class; Phaseo-caused 4xx are excluded; rates are a reachable/accepted/completed funnel');
} finally { await db.close(); }

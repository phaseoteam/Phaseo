import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrationPath = '../migrations/20261109123943_v2_request_attempts_upstream_detail.sql';
const workspace = '40000000-0000-4000-8000-000000000004';
const body = (sql) => {
  const start = sql.indexOf('$function$') + '$function$'.length;
  return sql.slice(start, sql.indexOf('$function$', start)).replaceAll('\r\n', '\n');
};
const errorTypeMigrationPath = '../migrations/20261109155651_v2_request_attempts_upstream_error_type.sql';
try {
  const migration = await read(migrationPath);
  const errorTypeMigration = await read(errorTypeMigrationPath);
  const desiredTable = await read('../schemas/public/tables/v2_request_attempts.sql');
  const desiredIngest = await read('../schemas/public/functions/ingest_v2_gateway_request.sql');
  const columnsByMigration = [
    [migration, ['status_text', 'upstream_error_code', 'upstream_error_message', 'upstream_error_description']],
    [errorTypeMigration, ['upstream_error_type']],
  ];
  for (const [sql, columns] of columnsByMigration) {
    assert.ok(sql.includes('\nSET local check_function_bodies = off;\n'));
    assert.ok(!/\b(drop|truncate)\b|\bdelete\s+from\b/i.test(sql), 'the migration must not be destructive');
    for (const column of columns) {
      assert.ok(new RegExp(`^  "${column}"\\s+text,$`, 'm').test(desiredTable), `declarative table declares ${column}`);
      assert.ok(sql.includes(`ADD COLUMN "${column}" text`), `migration adds ${column}`);
      const comment = desiredTable.split(/\r?\n/).find((line) => line.startsWith(`COMMENT ON COLUMN "public"."v2_request_attempts"."${column}"`));
      assert.ok(comment && sql.includes(comment), `migration comment for ${column} must match the declarative table`);
    }
  }

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
  for (const path of ['../migrations/20261104152910_pricing_lines_record_charged_sku_meter.sql',
    '../migrations/20261104163425_provider_attempt_health_classes.sql',
    '../migrations/20261104194200_provider_attempt_health_reasons.sql']) {
    await db.exec(await read(path));
  }
  // The patches start from the function as the declarative file had it before these changes.
  await db.exec(migration);
  await assert.rejects(db.exec(migration), /already installed|already exists/);
  await db.exec(errorTypeMigration);
  await assert.rejects(db.exec(errorTypeMigration), /already installed|already exists/);
  const installed = (await db.query(
    `select pg_get_functiondef('public.ingest_v2_gateway_request(jsonb)'::regprocedure) as definition`)).rows[0].definition;
  assert.equal(body(installed), body(desiredIngest), 'patched ingest body must match the declarative function byte for byte');

  const startedAt = Date.parse('2026-11-09T10:00:00.000Z');
  await db.query('select ingest_v2_gateway_request($1::jsonb)', [JSON.stringify({
    workspace_id: workspace, request_id: 'req-detail', occurred_at: '2026-11-09T10:00:01.000Z',
    requested_model_input: 'fixture/model', routed_model_slug: 'fixture/model',
    provider: 'backup', provider_model_id: 'backup:model', success: true, status_code: 200,
    safe_metadata: { testing_mode: false },
    attempts: [
      {
        attempt_number: 1, provider: 'fixture', provider_model_id: 'fixture:model', provider_api_model_id: 'model-2026',
        success: false, status_code: 429, error_code: 'upstream_non_2xx', failure_class: 'upstream_non_2xx',
        latency_ms: 35, started_at_unix_ms: startedAt, status_text: ' Too Many Requests ',
        upstream_error_code: 'rate_limit_exceeded', upstream_error_type: 'rate_limit_error_'.repeat(10),
        upstream_error_message: 'Rate limit reached. '.repeat(80),
        upstream_error_description: 'requests per minute', retryable: true, fallback_attempted: false,
      },
      {
        attempt_number: 2, provider: 'backup', provider_model_id: 'backup:model', provider_api_model_id: 'model',
        success: true, status_code: 200, latency_ms: 42, started_at_unix_ms: startedAt + 40,
        status_text: 'OK', upstream_error_code: null, upstream_error_type: '', upstream_error_message: null, fallback_attempted: true,
      },
      // Older callers send none of the new fields, and a bad start time is ignored.
      { attempt_number: 3, provider: 'backup', success: false, status_code: 500, latency_ms: 5, started_at_unix_ms: 'soon', status_text: '' },
    ],
  })]);
  const rows = (await db.query(`
    select attempt.attempt_number, attempt.started_at, attempt.completed_at, attempt.status_text,
      attempt.upstream_error_code, attempt.upstream_error_type, length(attempt.upstream_error_message) as message_length,
      attempt.upstream_error_description, attempt.safe_metadata, attempt.error_code
    from v2_request_attempts attempt join v2_request_facts fact using (request_event_id)
    where fact.request_id = 'req-detail' order by attempt.attempt_number`)).rows;
  assert.equal(rows.length, 3);
  assert.equal(rows[0].started_at.toISOString(), '2026-11-09T10:00:00.000Z');
  assert.equal(rows[0].completed_at.toISOString(), '2026-11-09T10:00:00.035Z');
  assert.equal(rows[0].status_text, 'Too Many Requests');
  assert.equal(rows[0].upstream_error_code, 'rate_limit_exceeded');
  assert.equal(rows[0].upstream_error_type, 'rate_limit_error_'.repeat(10).slice(0, 120), 'error types are capped at 120 characters');
  assert.equal(rows[0].error_code, 'upstream_non_2xx', 'error_code keeps the gateway failure type');
  assert.equal(rows[0].message_length, 1024, 'error messages are capped');
  assert.equal(rows[0].upstream_error_description, 'requests per minute');
  assert.equal(rows[0].safe_metadata.provider_api_model_id, 'model-2026');
  assert.equal('fallback_attempted' in rows[0].safe_metadata, false, 'false is not stored');
  assert.equal(rows[0].safe_metadata.retryable, true);
  assert.equal(rows[1].started_at.toISOString(), '2026-11-09T10:00:00.040Z');
  assert.equal(rows[1].completed_at.toISOString(), '2026-11-09T10:00:00.082Z');
  assert.equal(rows[1].status_text, 'OK');
  assert.equal(rows[1].upstream_error_code, null);
  assert.equal(rows[1].upstream_error_type, null, 'an empty error type is not stored');
  assert.equal(rows[1].message_length, null);
  assert.equal(rows[1].safe_metadata.fallback_attempted, true);
  assert.deepEqual(
    [rows[2].started_at, rows[2].completed_at, rows[2].status_text, rows[2].upstream_error_code, rows[2].upstream_error_type, rows[2].message_length],
    [null, null, null, null, null, null],
    'attempts without the new fields still ingest');
  console.log('Attempts store their status text, provider error and error type, start and end time for the request-detail views');
} finally {
  await db.close();
}

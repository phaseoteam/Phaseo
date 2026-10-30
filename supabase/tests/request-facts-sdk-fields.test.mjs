import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const migrationPath = '../migrations/20261027224949_store_sdk_client_fields_on_request_facts.sql';
const schemaPath = '../schemas/public/functions/ingest_v2_gateway_request.sql';
const workspace = '40000000-0000-4000-8000-000000000001';
const functionBody = (sql) => {
  const start = sql.indexOf('$function$') + '$function$'.length;
  return sql.slice(start, sql.indexOf('$function$', start)).replaceAll('\r\n', '\n');
};
try {
  const migration = await read(migrationPath);
  const desired = await read(schemaPath);
  assert.ok(migration.includes('\nSET local check_function_bodies = off;\n'));
  assert.equal(functionBody(migration), functionBody(desired), 'migration body must match the declarative schema');

  for (const path of ['./fixtures/staged-reporting-before.sql',
    '../migrations/20261009114400_exclude_staged_models_from_public_reporting.sql',
    '../migrations/20261009114619_align_staged_reporting_function_definitions.sql']) {
    await db.exec(await read(path));
  }
  await db.exec(`
    alter table v2_request_facts alter column request_event_id set default gen_random_uuid();
    create table v2_model_aliases(alias_slug text, model_slug text, enabled boolean);
    insert into v2_models(model_slug,hidden,status,released_at,updated_at) values
      ('fixture/model',false,'active','2026-08-01','2026-10-01');
    insert into v2_model_provider_routes(provider_model_id,model_slug,provider_slug,provider_model_slug,
      status,routing_enabled,access_scope,phaseo_status,is_stealth,provider_availability_status,updated_at) values
      ('fixture:model','fixture/model','fixture','model','active',true,'public','enabled',false,'available','2026-10-01');
  `);
  await db.exec(migration);
  await db.exec(`create function public.is_workspace_member(uuid) returns boolean language sql as 'select false';`);
  await db.exec(await read('../schemas/public/tables/v2_request_routing_decisions.sql'));
  await db.exec(await read('../schemas/public/tables/v2_request_routing_traces.sql'));
  const withRouting = await read('../schemas/public/functions/ingest_v2_gateway_request_with_routing.sql');
  await db.exec(withRouting.slice(0, withRouting.indexOf('$function$;') + '$function$;'.length));

  const event = (id, overrides = {}) => ({
    workspace_id: workspace, request_id: id, occurred_at: '2026-10-27T12:00:00Z',
    requested_model_input: 'fixture/model', routed_model_slug: 'fixture/model',
    provider: 'fixture', provider_model_id: 'fixture:model', success: true, status_code: 200,
    safe_metadata: { testing_mode: false },
    attempts: [{ provider: 'fixture', provider_model_id: 'fixture:model', provider_api_model_id: 'model', success: true }],
    ...overrides,
  });
  const ingest = async (fn, value) => (await db.query(
    `select ${fn}($1::jsonb) id`, [JSON.stringify(value)])).rows[0].id;
  const fields = async (id) => (await db.query(
    'select sdk_name, sdk_version, client_version from v2_request_facts where workspace_id=$1 and request_id=$2',
    [workspace, id])).rows[0];

  // Official SDK request: all three fields land on the fact row.
  await ingest('ingest_v2_gateway_request', event('sdk', {
    sdk_name: 'phaseo-typescript', sdk_version: '2.2.0', client_version: '2.2.0' }));
  assert.deepEqual(await fields('sdk'), {
    sdk_name: 'phaseo-typescript', sdk_version: '2.2.0', client_version: '2.2.0' });

  // Non-SDK client: the gateway sends null SDK fields and only a client version.
  await ingest('ingest_v2_gateway_request', event('curl', {
    sdk_name: null, sdk_version: null, client_version: '8.18.0' }));
  assert.deepEqual(await fields('curl'), { sdk_name: null, sdk_version: null, client_version: '8.18.0' });

  // Missing keys, empty and whitespace-only strings become null; values are trimmed and capped.
  await ingest('ingest_v2_gateway_request', event('missing'));
  assert.deepEqual(await fields('missing'), { sdk_name: null, sdk_version: null, client_version: null });
  await ingest('ingest_v2_gateway_request', event('blank', {
    sdk_name: '', sdk_version: '   ', client_version: ` ${'9'.repeat(200)} ` }));
  assert.deepEqual(await fields('blank'), { sdk_name: null, sdk_version: null, client_version: '9'.repeat(128) });

  // Idempotent retries refresh the fields rather than keeping stale values.
  await ingest('ingest_v2_gateway_request', event('sdk', {
    sdk_name: 'phaseo-typescript', sdk_version: '2.2.1', client_version: '2.2.1' }));
  assert.deepEqual(await fields('sdk'), {
    sdk_name: 'phaseo-typescript', sdk_version: '2.2.1', client_version: '2.2.1' });
  assert.equal((await db.query('select count(*)::int n from v2_request_facts where request_id=$1', ['sdk'])).rows[0].n, 1);

  // The routing variant the gateway calls first passes the fields through.
  await ingest('ingest_v2_gateway_request_with_routing', event('routed', {
    sdk_name: 'phaseo-agent-typescript', sdk_version: '0.3.0', client_version: '0.3.0',
    routing_decisions: [], routing_trace: {} }));
  assert.deepEqual(await fields('routed'), {
    sdk_name: 'phaseo-agent-typescript', sdk_version: '0.3.0', client_version: '0.3.0' });

  console.log('SDK name, SDK version and client version are stored on v2_request_facts');
} finally { await db.close(); }

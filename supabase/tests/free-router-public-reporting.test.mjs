import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const workspace = '30000000-0000-4000-8000-000000000001';
try {
  for (const path of ['./fixtures/staged-reporting-before.sql',
    '../migrations/20261009114400_exclude_staged_models_from_public_reporting.sql',
    '../migrations/20261009114619_align_staged_reporting_function_definitions.sql']) {
    await db.exec(await read(path));
  }
  await db.exec(`
    alter table v2_request_facts alter column request_event_id set default gen_random_uuid();
    create table v2_model_aliases(alias_slug text, model_slug text, enabled boolean);
    insert into v2_models(model_slug,hidden,status,released_at,updated_at) values
      ('fixture/public:free',false,'active','2026-08-01','2026-10-01'),
      ('fixture/hidden:free',true,'active','2026-08-01','2026-10-01'),
      ('fixture/stealth:free',false,'active','2026-08-01','2026-10-01'),
      ('fixture/unreleased:free',false,'active','2099-01-01','2026-10-01'),
      ('fixture/internal:free',false,'active','2026-08-01','2026-10-01');
    insert into v2_model_provider_routes(provider_model_id,model_slug,provider_slug,provider_model_slug,
      status,routing_enabled,access_scope,phaseo_status,is_stealth,provider_availability_status,updated_at) values
      ('fixture:public','fixture/public:free','fixture','public','active',true,'public','enabled',false,'available','2026-10-01'),
      ('fixture:hidden','fixture/hidden:free','fixture','hidden','active',true,'public','enabled',false,'available','2026-10-01'),
      ('fixture:stealth','fixture/stealth:free','fixture','stealth','active',true,'public','enabled',true,'available','2026-10-01'),
      ('fixture:unreleased','fixture/unreleased:free','fixture','unreleased','active',true,'public','enabled',false,'available','2026-10-01'),
      ('fixture:internal','fixture/internal:free','fixture','internal','active',true,'internal','enabled',false,'available','2026-10-01');
  `);
  const desired = await read('../schemas/public/functions/ingest_v2_gateway_request.sql');
  const start = desired.indexOf('  -- The free router is a selector');
  const end = desired.indexOf('  insert into public.v2_request_facts (', start);
  assert.ok(start > 0 && end > start);
  // Reproduce the deployed pre-fix ingestion, including its real privacy trigger.
  await db.exec(desired.slice(0, start) + desired.slice(end));
  await db.exec(await read('../schemas/public/functions/sync_v2_request_fact_provider_model_id.sql'));
  await db.exec(`create trigger sync_v2_request_fact_provider_model_id
    after insert or update of provider_model_id on v2_request_attempts
    for each row execute function sync_v2_request_fact_provider_model_id();`);
  const event = (id, route = 'public', overrides = {}) => ({
    workspace_id: workspace, request_id: id, occurred_at: '2026-10-12T12:00:00Z',
    requested_model_input: 'phaseo/free', routed_model_slug: 'phaseo/free',
    provider: 'fixture', success: true, status_code: 200,
    safe_metadata: { testing_mode: false },
    attempts: [{ provider: 'fixture', provider_model_id: `fixture:${route}`,
      provider_api_model_id: route, success: true }], ...overrides,
  });
  const ingest = async (value) => (await db.query(
    'select ingest_v2_gateway_request($1::jsonb) id', [JSON.stringify(value)])).rows[0].id;
  const fact = async (id) => (await db.query(
    'select * from v2_request_facts where request_id=$1', [id])).rows[0];
  await ingest(event('old-public'));
  assert.equal((await fact('old-public')).public_reporting_allowed, false);
  assert.equal((await fact('old-public')).routed_model_slug, 'fixture/public:free');
  // A public witness and unchanged catalogue state precede the regression.
  await ingest(event('witness', 'public', { occurred_at: '2026-10-08T12:00:00Z',
    routed_model_slug: 'fixture/public:free', provider_model_id: 'fixture:public' }));
  for (const route of ['hidden', 'stealth', 'unreleased', 'internal']) await ingest(event(`old-${route}`, route));
  await ingest(event('old-testing', 'public', { safe_metadata: { testing_mode: true } }));
  await db.exec(`insert into gateway_requests(id,created_at,workspace_id,request_id,model_id,
    canonical_model_id,provider,success,detail_metadata) values
    (gen_random_uuid(),'2026-10-12T12:00:00Z','${workspace}','old-testing','phaseo/free',
    'phaseo/free','fixture',true,'{"testing_mode":true}');`);
  await ingest(event('old-before-cutoff', 'public', { occurred_at: '2026-10-08T12:00:00Z' }));
  await ingest(event('old-missing-original'));
  // Old private history must remain private even after release.
  await db.exec(`update v2_models set hidden=false,updated_at='2026-10-11'
    where model_slug='fixture/hidden:free';
    update v2_model_provider_routes set is_stealth=false,updated_at='2026-10-11'
    where provider_model_id='fixture:stealth';`);
  await db.exec(await read('../migrations/20261013144501_resolve_free_router_reporting_before_insert.sql'));
  await ingest(event('new-public'));
  assert.equal((await fact('new-public')).public_reporting_allowed, true);
  assert.equal((await fact('new-public')).routed_model_slug, 'fixture/public:free');
  await ingest(event('new-public')); // Retry is idempotent.
  assert.equal((await fact('new-public')).public_reporting_allowed, true);
  await ingest(event('old-testing')); // A retry cannot erase the historical test exclusion.
  assert.equal((await fact('old-testing')).public_reporting_allowed, false);
  for (const route of ['unreleased', 'internal']) {
    await ingest(event(`new-${route}`, route));
    assert.equal((await fact(`new-${route}`)).public_reporting_allowed, false);
  }
  await db.exec(`update v2_models set hidden=true where model_slug='fixture/hidden:free';
    update v2_model_provider_routes set is_stealth=true where provider_model_id='fixture:stealth';`);
  for (const route of ['hidden', 'stealth']) {
    await ingest(event(`new-${route}`, route));
    assert.equal((await fact(`new-${route}`)).public_reporting_allowed, false);
  }
  await ingest(event('new-testing', 'public', { safe_metadata: { testing_mode: true } }));
  await ingest(event('new-unresolved', 'public', { attempts: [] }));
  await ingest(event('new-wrong-provider', 'public', { provider: 'other' }));
  for (const id of ['new-testing', 'new-unresolved', 'new-wrong-provider']) {
    assert.equal((await fact(id)).public_reporting_allowed, false);
  }
  // Link content-free authoritative records for the approved historical repair.
  await db.exec(`update v2_models set hidden=false where model_slug='fixture/hidden:free';
    update v2_model_provider_routes set is_stealth=false where provider_model_id='fixture:stealth';
    insert into gateway_requests(id,created_at,workspace_id,request_id,model_id,
      canonical_model_id,provider,success,detail_metadata)
    select gen_random_uuid(),occurred_at,workspace_id,request_id,'phaseo/free','phaseo/free','fixture',success,
      jsonb_build_object('testing_mode',safe_metadata->>'testing_mode')
    from v2_request_facts where request_id like 'old-%'
      and request_id not in ('old-missing-original','old-testing');
    update v2_request_facts f set gateway_request_id=g.id,gateway_request_created_at=g.created_at
    from gateway_requests g where g.request_id=f.request_id;`);
  await db.exec(await read('../operations/repair-free-router-public-reporting.sql'));
  assert.equal((await fact('old-public')).public_reporting_allowed, true);
  for (const id of ['old-hidden','old-stealth','old-unreleased','old-internal',
    'old-before-cutoff','old-testing','old-missing-original']) {
    assert.equal((await fact(id)).public_reporting_allowed, false, `${id} must remain private`);
  }
  await db.exec(await read('../operations/repair-free-router-public-reporting.sql'));
  assert.equal((await fact('old-public')).public_reporting_allowed, true);
  // Even a direct flag update cannot reopen a historical private request.
  await db.exec(`update v2_request_facts set public_reporting_allowed=true where request_id='old-testing';`);
  assert.equal((await fact('old-testing')).public_reporting_allowed, false);
  assert.equal((await db.query(`select tgenabled from pg_trigger where tgname='set_public_reporting_scope'
    and tgrelid='v2_request_facts'::regclass`)).rows[0].tgenabled, 'O');
  console.log('Free-router ingestion, bounded repair, retries and historical privacy exclusions passed');
} finally { await db.close(); }

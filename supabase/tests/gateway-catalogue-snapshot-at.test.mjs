import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const route = '30000000-0000-4000-8000-000000000001';
const currentSku = '40000000-0000-4000-8000-000000000001';
const nextSku = '40000000-0000-4000-8000-000000000002';
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
const at = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

try {
  await db.exec(await readFile(new URL('./fixtures/context-bundle-before.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../migrations/20260916121303_gateway_context_bundle.sql', import.meta.url), 'utf8'));
  // Columns and objects added to the live catalogue after the context-bundle fixture was captured.
  await db.exec(`
    alter table public.v2_providers
      add column if not exists routable boolean, add column if not exists credential_mode text,
      add column if not exists provider_family_slug text, add column if not exists offer_scope text,
      add column if not exists offer_label text, add column if not exists residency_mode text,
      add column if not exists default_execution_regions text[], add column if not exists default_data_regions text[],
      add column if not exists zero_data_retention boolean, add column if not exists prompt_training_policy text,
      add column if not exists data_policy_tier text, add column if not exists data_policy_confidence text,
      add column if not exists data_policy_contract_mode text, add column if not exists data_policy_variant text,
      add column if not exists stream_cancellation_support text, add column if not exists stream_cancellation_stops_provider_billing boolean,
      add column if not exists stream_cancellation_usage_recovery text, add column if not exists stream_cancellation_evidence_kind text,
      add column if not exists stream_cancellation_source_url text;
    alter table public.v2_models add column if not exists retired_at timestamptz;
    alter table public.v2_model_provider_routes add column if not exists credential_mode text;
    alter table public.v2_pricing_skus add column if not exists service_tier_slug text;
    create table if not exists private.routing_catalogue_revision (singleton boolean primary key default true, revision bigint not null);
    insert into private.routing_catalogue_revision(singleton, revision) values (true, 42) on conflict do nothing;
    grant select, update on table private.routing_catalogue_revision to service_role;
    create or replace function public.gateway_catalogue_revision() returns text language sql stable set search_path to ''
      as $$ select revision::text from private.routing_catalogue_revision where singleton $$;
  `);
  const migration = await readFile(new URL('../migrations/20261009090000_gateway_catalogue_snapshot_at.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);

  await db.exec(`
    insert into public.v2_models(model_slug,status,hidden,input_modalities,output_modalities) values ('lab/model','active',false,array['text'],array['text']);
    insert into public.v2_providers(provider_slug,status,routing_enabled,metadata) values ('test','active',true,'{}');
    insert into public.v2_model_provider_routes(provider_model_id,provider_slug,model_slug,provider_model_slug,status,routing_enabled,input_modalities,output_modalities,metadata)
      values ('${route}','test','lab/model','upstream-model','active',true,array['text'],array['text'],'{}');
    insert into public.v2_route_capabilities(provider_model_id,capability_id,status,params,created_at) values
      ('${route}','text.generate','active','{"temperature":true}',now());
    insert into public.v2_pricing_skus(sku_id,provider_model_id,operation,status,currency,metadata,effective_to,updated_at) values
      ('${currentSku}','${route}','text.generate','active','USD','{}','${at(600_000)}',now()),
      ('${nextSku}','${route}','text.generate','active','USD','{}',null,now());
    update public.v2_pricing_skus set effective_from='${at(600_000)}' where sku_id='${nextSku}';
    insert into public.v2_pricing_sku_meters(sku_meter_id,sku_id,meter_key,unit,unit_quantity,price_nanos,billable,meter_order,metadata,updated_at) values
      ('50000000-0000-4000-8000-000000000001','${currentSku}','input_text_tokens','token',1000000,200000000,true,100,'{}',now()),
      ('50000000-0000-4000-8000-000000000002','${nextSku}','input_text_tokens','token',1000000,300000000,true,100,'{}',now());
  `);

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(one(`select public.gateway_fetch_public_catalog_at('lab/model',array['text.generate'],now()) as value`), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');

  const legacy = await one(`select public.gateway_fetch_public_catalog('lab/model',array['text.generate']) as value`);
  assert.equal('revision' in legacy, false, 'deployed gateways reject unknown snapshot keys');
  assert.equal('boundaryAt' in legacy, false);
  assert.equal(legacy.variants[0].providers.length, 1);

  const current = await one(`select public.gateway_fetch_public_catalog_at('lab/model',array['text.generate'],now()) as value`);
  assert.equal(current.revision, '42');
  const boundaryAt = (await one(`select effective_from as value from public.v2_pricing_skus where sku_id='${nextSku}'`)).getTime();
  assert.equal(current.boundaryAt, boundaryAt);
  assert.equal(current.expiresAt <= current.boundaryAt, true);
  assert.equal(current.variants[0].pricing.test.rules[0].price_per_unit, 0.2);
  // Apart from the added fields, the legacy wrapper returns the same snapshot.
  const { revision: _revision, boundaryAt: _boundary, checkedAt: _c1, expiresAt: _e1, ...currentShape } = current;
  const { checkedAt: _c2, expiresAt: _e2, ...legacyShape } = legacy;
  assert.deepEqual(currentShape, legacyShape);

  const next = await one(`select public.gateway_fetch_public_catalog_at('lab/model',array['text.generate'],$1::timestamptz) as value`, [new Date(boundaryAt).toISOString()]);
  assert.equal(next.checkedAt, boundaryAt);
  assert.equal(next.boundaryAt, null);
  assert.equal(next.variants[0].pricing.test.rules[0].price_per_unit, 0.3);

  await assert.rejects(one(`select public.gateway_fetch_public_catalog_at('lab/model',array['text.generate'],now() - interval '1 hour') as value`), /invalid_public_catalog_time/);
  await assert.rejects(one(`select public.gateway_fetch_public_catalog_at('lab/model',array['text.generate'],now() + interval '2 days') as value`), /invalid_public_catalog_time/);
  await assert.rejects(one(`select public.gateway_fetch_public_catalog_at('@preset',array['text.generate'],now()) as value`), /invalid_public_catalog_request/);
  console.log('gateway catalogue snapshot_at contract passed');
} finally {
  await db.close();
}

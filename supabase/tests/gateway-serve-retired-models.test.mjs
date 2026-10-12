import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');

const db = new PGlite();
const route = '30000000-0000-4000-8000-000000000001';
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;

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
  await db.exec(await readFile(new URL('../migrations/20261009000100_gateway_catalogue_snapshot_at.sql', import.meta.url), 'utf8'));
  const migration = await readFile(new URL('../migrations/20261012150200_serve_retired_models_with_routes.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);

  await db.exec(`
    insert into public.v2_models(model_slug,status,hidden,input_modalities,output_modalities,retired_at)
      values ('lab/old','retired',false,array['text'],array['text'],now() - interval '30 days');
    insert into public.v2_providers(provider_slug,status,routing_enabled,metadata) values ('host','active',true,'{}');
    insert into public.v2_model_provider_routes(provider_model_id,provider_slug,model_slug,provider_model_slug,status,routing_enabled,input_modalities,output_modalities,metadata)
      values ('${route}','host','lab/old','old','active',true,array['text'],array['text'],'{}');
    insert into public.v2_route_capabilities(provider_model_id,capability_id,status,params,created_at) values
      ('${route}','text.generate','active','{}',now());
  `);
  await db.exec('set role service_role');
  const snapshot = (at) => one(`select public.gateway_fetch_public_catalog_at('lab/old',array['text.generate'],${at}) as value`);

  // A retired model is served while a provider route stays enabled.
  assert.equal((await snapshot('now()')).variants[0].providers.length, 1);

  // A future retirement date is no longer a snapshot boundary.
  await db.exec('reset role');
  await db.exec(`update public.v2_models set status='deprecated', retired_at=now() + interval '2 minutes' where model_slug='lab/old'`);
  await db.exec('set role service_role');
  const beforeRetirement = await snapshot('now()');
  assert.equal(beforeRetirement.boundaryAt, null);
  assert.equal((await snapshot(`now() + interval '3 minutes'`)).variants[0].providers.length, 1);

  // Disabling the route is what stops traffic; hidden and draft models stay out.
  await db.exec('reset role');
  await db.exec(`update public.v2_model_provider_routes set routing_enabled=false where provider_model_id='${route}'`);
  await db.exec('set role service_role');
  assert.equal((await snapshot('now()')).variants[0].providers.length, 0);
  await db.exec('reset role');
  await db.exec(`update public.v2_model_provider_routes set routing_enabled=true where provider_model_id='${route}';
    update public.v2_models set status='draft' where model_slug='lab/old'`);
  await db.exec('set role service_role');
  assert.equal((await snapshot('now()')).variants[0].providers.length, 0);
  await db.exec('reset role');
  await db.exec(`update public.v2_models set status='retired', hidden=true where model_slug='lab/old'`);
  await db.exec('set role service_role');
  assert.equal((await snapshot('now()')).variants[0].providers.length, 0);
  console.log('gateway serves retired models with routes');
} finally {
  await db.close();
}

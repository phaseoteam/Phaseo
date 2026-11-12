import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installCatalogPolicyContext } from './fixtures/catalog-policy-context.mjs';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const feed = JSON.parse(await readFile(new URL('../../apps/web-api/src/routes/account/__fixtures__/catalog-data-policy-provider.json', import.meta.url), 'utf8'));
const resolve = async (offer, capability = 'text.generate') => (await db.query(
  'select public.resolve_catalog_data_policy($1,$2) as policy', [offer, capability])).rows[0].policy;
try {
  await db.exec(await readFile(new URL('./fixtures/context-bundle-before.sql', import.meta.url), 'utf8'));
  await installCatalogPolicyContext(db);
  await db.exec(`insert into public.provider_catalog_sources values
    ('catalog-policy-test',null,'managed','active',now())`);
  for (const model of feed.data) for (const tier of model.service_tiers) {
    const offer = `${model.id}:${tier.service_tier}`;
    await db.query(`insert into public.v2_model_provider_routes(provider_model_id,provider_slug,metadata)
      values ($1,'catalog-policy-test',$2)`, [offer, { catalog_service_tier: tier.service_tier }]);
    await db.query(`insert into public.v2_route_capabilities(provider_model_id,capability_id,metadata)
      values ($1,'text.generate',$2)`, [offer, { catalog_data_policy: {
      declaration: tier.data_policy.capabilities[0], catalogUrl: null, managementMode: 'managed' } }]);
  }
  const native = 'catalog-policy-test/native:standard';
  assert.equal((await resolve(native)).zeroDataRetention, false, 'provider cannot self-approve');
  await db.exec(`insert into public.provider_catalog_policy_approvals values
    ('catalog-policy-test',true,null,'managed','https://provider.example/privacy')`);
  assert.equal((await resolve(native)).zeroDataRetention, true);
  assert.equal((await resolve('catalog-policy-test/resold:standard')).zeroDataRetention, false);
  assert.equal((await resolve('catalog-policy-test/resold:standard')).retentionDays, 30);
  assert.equal((await resolve('catalog-policy-test/conditional:standard')).zeroDataRetention, false);
  assert.equal((await resolve('catalog-policy-test/native:batch')).zeroDataRetention, false);
  // Even malformed stored declarations cannot elevate batch or stateful routes.
  await db.query(`update public.v2_route_capabilities set metadata=(select metadata
    from public.v2_route_capabilities where provider_model_id=$1) where provider_model_id=$2`,
    [native, 'catalog-policy-test/native:batch']);
  assert.equal((await resolve('catalog-policy-test/native:batch')).zeroDataRetention, false);
  await db.query(`insert into public.v2_route_capabilities(provider_model_id,capability_id,metadata)
    select provider_model_id,'files.upload',metadata from public.v2_route_capabilities where provider_model_id=$1`, [native]);
  assert.equal((await resolve(native, 'files.upload')).zeroDataRetention, false);
  await db.exec(`update public.provider_catalog_policy_approvals set enabled=false`);
  assert.equal((await resolve(native)).zeroDataRetention, false, 'revocation needs no fetch');
  await db.exec(`update public.provider_catalog_policy_approvals set enabled=true;
    update public.provider_catalog_sources set last_success_at=now()-interval '25 hours'`);
  assert.equal((await resolve(native)).zeroDataRetention, false, 'stale declaration expires');
  await db.exec(`update public.provider_catalog_sources set last_success_at=now(),catalog_url='https://changed.example/catalog'`);
  assert.equal((await resolve(native)).zeroDataRetention, false, 'source replacement needs approval');
  await db.exec(`update public.provider_catalog_sources set catalog_url=null`);
  assert.equal((await resolve(native)).zeroDataRetention, true);
  for (const declaration of [null, { ...feed.data[0].service_tiers[0].data_policy.capabilities[0], zero_data_retention: false, zdr_eligibility: 'ineligible' }]) {
    await db.query(`update public.v2_route_capabilities set metadata=jsonb_set(metadata,
      '{catalog_data_policy,declaration}',$2) where provider_model_id=$1`, [native, JSON.stringify(declaration)]);
    assert.equal((await resolve(native)).zeroDataRetention, false, 'withdrawal removes guarantee');
  }
  await db.query(`update public.v2_route_capabilities set metadata=metadata ||
    '{"data_policy":{"zeroDataRetention":true,"reason":"Administrator pin"}}'::jsonb where provider_model_id=$1`, [native]);
  assert.equal((await resolve(native)).reason, 'Administrator pin');
  console.log('Catalog policy database controls passed: native, resold, conditional, batch, files, approval, revocation, expiry, source replacement, withdrawal and manual pin');
} finally { await db.close(); }

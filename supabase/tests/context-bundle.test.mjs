import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const wsA = '10000000-0000-4000-8000-000000000001';
const wsB = '10000000-0000-4000-8000-000000000002';
const keyA = '20000000-0000-4000-8000-000000000001';
const keyB = '20000000-0000-4000-8000-000000000002';
const route = '30000000-0000-4000-8000-000000000001';
const sku = '40000000-0000-4000-8000-000000000001';
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
const bundle = (ws = wsA, key = keyA, include = true) => one(
  'select public.gateway_fetch_request_context_bundle($1,$2,$3,$4,$5) as value', [ws, 'lab/model', 'responses', key, include]);
try {
  await db.exec(await readFile(new URL('./fixtures/context-bundle-before.sql', import.meta.url), 'utf8'));
  const migration = await readFile(new URL('../migrations/20260916121303_gateway_context_bundle.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(`
    insert into public.workspaces(id,billing_mode,created_at) values ('${wsA}','wallet',now()),('${wsB}','invoice',now());
    insert into public.workspace_settings(workspace_id,routing_mode,privacy_zdr_only) values ('${wsA}','balanced',true),('${wsB}','price',false);
    insert into public.keys(id,workspace_id,status,soft_blocked,daily_limit_requests,created_at) values
      ('${keyA}','${wsA}','active',false,100,now()),('${keyB}','${wsB}','active',false,0,now());
    insert into public.wallets(workspace_id,balance_nanos,reserved_nanos) values ('${wsA}',5000000000,2000000000),('${wsB}',8000000000,0);
    insert into public.v2_models(model_slug,status,hidden,input_modalities,output_modalities) values ('lab/model','active',false,array['text'],array['text']);
    insert into public.v2_providers(provider_slug,status,routing_enabled,metadata) values ('test','active',true,'{}');
    insert into public.v2_model_provider_routes(provider_model_id,provider_slug,model_slug,provider_model_slug,status,routing_enabled,input_modalities,output_modalities,metadata)
      values ('${route}','test','lab/model','upstream-model','active',true,array['text'],array['text'],'{}');
    insert into public.v2_route_capabilities(provider_model_id,capability_id,status,params,created_at) values
      ('${route}','text.generate','active','{"temperature":true}',now()),('${route}','responses','active','{"tools":true}',now());
    insert into public.v2_pricing_skus(sku_id,provider_model_id,operation,status,currency,metadata,updated_at) values
      ('${sku}','${route}','text.generate','active','USD','{"included_quantity":5}',now());
    insert into public.v2_pricing_sku_meters(sku_meter_id,sku_id,meter_key,unit,unit_quantity,price_nanos,billable,meter_order,metadata,updated_at)
      values ('50000000-0000-4000-8000-000000000001','${sku}','input_text_tokens','token',1000000,200000000,true,100,'{}',now());
    insert into public.byok_keys(id,workspace_id,provider_id,enabled,fingerprint_sha256,key_version,always_use) values
      ('60000000-0000-4000-8000-000000000001','${wsA}','test',true,'workspace-a-fingerprint',1,true),
      ('60000000-0000-4000-8000-000000000002','${wsB}','test',true,'workspace-b-fingerprint',1,false);
  `);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(bundle(), /permission denied/);
    await assert.rejects(one("select public.gateway_fetch_public_catalog('lab/model',array['text.generate']) as value"), /permission denied/);
    await assert.rejects(one('select private.gateway_context_access($1,$2,$3,$4) as value', [wsA,'lab/model','responses',keyA]), /permission denied/);
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  const a = await bundle();
  const b = await bundle(wsB,keyB);
  assert.equal(a.context.credit_ok.balance_nanos,3000000000);
  assert.equal(a.context.workspace_id,wsA);
  assert.equal(b.context.workspace_id,wsB);
  assert.equal(a.settings.routing_mode,'balanced');
  assert.equal(b.billingMode,'invoice');
  assert.equal(a.byok.test[0].fingerprint_sha256,'workspace-a-fingerprint');
  assert.equal(b.byok.test[0].fingerprint_sha256,'workspace-b-fingerprint');
  assert.equal(a.catalog.variants.length,2);
  assert.equal(a.catalog.variants[0].providers[0].capability_params.temperature,true);
  assert.equal(a.catalog.variants[1].providers[0].capability_params.tools,true);
  assert.equal(a.catalog.variants[0].pricing.test.rules[0].included_quantity,5);
  assert.equal(a.catalog.variants[0].pricing.test.rules[0].price_per_unit,0.2);
  assert.equal(a.catalog.variants[0].providers[0].byok_meta.length,0);
  for (const secret of [wsA,wsB,keyA,keyB,'fingerprint','billingMode','settings']) assert.ok(!JSON.stringify(a.catalog).includes(secret));
  assert.equal((await bundle(wsA,keyA,false)).catalog,null);
  await assert.rejects(bundle(wsB,keyA), /api_key_wrong_team/);
  await db.query("update public.keys set status='disabled' where id=$1",[keyA]);
  await assert.rejects(bundle(), /api_key_inactive/);
  await db.query("update public.keys set status='active', daily_limit_requests=1 where id=$1",[keyA]);
  await db.query('insert into public.gateway_requests(workspace_id,key_id,created_at,success,cost_nanos) values ($1,$2,now(),true,1)',[wsA,keyA]);
  assert.equal((await bundle()).context.key_limit_ok.reason,'daily_request_limit_reached');
  await db.query('update public.keys set daily_limit_requests=0 where id=$1',[keyA]);
  await db.query('insert into public.test_budget_status values ($1,$2)',[wsA,{ok:true,budgets:[{id:'configured',limit_nanos:1000}]}]);
  assert.equal((await bundle()).context.key_limit_ok.budgets.length,1);
  await db.query('update public.test_budget_status set status=$2 where workspace_id=$1',[wsA,{ok:false,reason:'workspace_budget_exceeded',budgets:[{id:'configured'}]}]);
  assert.equal((await bundle()).context.key_limit_ok.reason,'workspace_budget_exceeded');
  await db.exec("update public.v2_pricing_skus set effective_to=now()+interval '5 seconds'");
  const bounded = (await bundle()).catalog;
  assert.ok(bounded.expiresAt-bounded.checkedAt <= 5000);
  await db.exec("update public.v2_models set hidden=true");
  assert.equal((await bundle()).catalog.variants[0].providers.length,0);
  await db.exec("update public.v2_models set hidden=false; update public.v2_route_capabilities set effective_from=now()+interval '1 hour'");
  assert.equal((await bundle()).catalog.variants[0].providers.length,0);
  console.log('Context bundle SQL: roles, tenant/key isolation, wallet reservations, budgets, capability union, prices, hidden/future routes, absolute expiry and idempotence passed.');
} finally { await db.close(); }

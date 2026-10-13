// PGLITE_MODULE may point at an existing external PGlite installation.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create table users(user_id uuid primary key,role text);
    create table v2_labs(lab_slug text primary key,name text,metadata jsonb);
    create table v2_models(model_slug text primary key,name text,lab_slug text,hidden boolean);
    create schema catalogue_private;
    create function catalogue_private.record_row_history() returns trigger language plpgsql as $$ begin return coalesce(new,old); end $$;
    create function prevent_catalogue_removal() returns trigger language plpgsql as $$ begin raise exception 'history preserved'; end $$;
    create table v2_subscription_plans(plan_uuid uuid primary key,plan_id text not null,name text not null,lab_slug text,
      description text,frequency text,price numeric,currency text,link text,other_info jsonb not null default '{}',created_at timestamptz,updated_at timestamptz,effective_to timestamptz);
    create table v2_subscription_plan_features(plan_uuid uuid references v2_subscription_plans,feature_name text,feature_value text,
      feature_description text,other_info jsonb not null default '{}',effective_to timestamptz,primary key(plan_uuid,feature_name));
    create table v2_subscription_plan_models(plan_uuid uuid references v2_subscription_plans,model_slug text references v2_models,
      model_info jsonb not null default '{}',rate_limit jsonb not null default '{}',other_info jsonb not null default '{}',effective_to timestamptz,primary key(plan_uuid,model_slug));
    insert into v2_labs values('test','Test','{}');
    insert into v2_models values('model','Model','test',false),('hidden','Hidden','test',true);
    insert into v2_subscription_plans(plan_uuid,plan_id,name,lab_slug,frequency,price,currency,other_info)
    values(md5('month')::uuid,'pro','Pro','test','monthly',20,'USD','{}'),
      (md5('year')::uuid,'pro','Pro','test','yearly',200,'USD','{}'),
      (md5('custom')::uuid,'enterprise','Enterprise','test','monthly',0,'USD','{}'),
      (md5('quarter')::uuid,'coding','Coding','test','quarterly',54,'USD','"From 2nd quarter"'),
      (md5('usage')::uuid,'usage','Usage','test','custom',0,'USD','"Consumption-based API pricing"'),
      (md5('team')::uuid,'windsurf-teams','Teams','test','monthly',80,'USD','"Base team plan; full developer seats cost an additional $40 per month each"');
    insert into v2_subscription_plan_features(plan_uuid,feature_name,feature_value,feature_description) values
      (md5('custom')::uuid,'Pricing','Custom',null),(md5('year')::uuid,'Annual Only','Included',null),
      (md5('month')::uuid,'Points','10,000 / Day',null),(md5('month')::uuid,'Daily Credits','$2 / User / Day on login',null),
      (md5('month')::uuid,'5-Hour Limit','Up to approx. 80 prompts',null),
      (md5('month')::uuid,'Weekly Limit','Up to approx. 400 prompts',null),
      (md5('month')::uuid,'GitHub AI Credits','1,900 / User / Month','Credits are pooled across the organization; additional usage is $0.01 per credit when enabled.'),
      (md5('month')::uuid,'Agent Usage','6–7 agents','Typical concurrent agent usage');
    insert into v2_subscription_plan_models(plan_uuid,model_slug) values(md5('year')::uuid,'model'),(md5('year')::uuid,'hidden');
  `);
  let snapshot;
  if (process.env.SUBSCRIPTION_SNAPSHOT) {
    snapshot=JSON.parse(await readFile(process.env.SUBSCRIPTION_SNAPSHOT,'utf8'));
    await db.exec('truncate v2_subscription_plan_models,v2_subscription_plan_features,v2_subscription_plans,v2_models,v2_labs');
    for (const [table,key] of [['v2_labs','labs'],['v2_models','model_catalogue'],['v2_subscription_plans','plans'],['v2_subscription_plan_features','features'],['v2_subscription_plan_models','models']]) {
      await db.query(`insert into ${table} select * from jsonb_populate_recordset(null::${table},$1::jsonb)`,[JSON.stringify(snapshot[key])]);
    }
  }
  await db.exec(await readFile(new URL('../migrations/20261013111609_structured_subscription_catalogue.sql',import.meta.url),'utf8'));
  if (snapshot) {
    const active=(row)=>!row.effective_to || Date.parse(row.effective_to)>Date.now();
    const expected=new Set(snapshot.plans.filter(active).map(row=>`${row.lab_slug}:${row.plan_id}`));
    const catalogue=(await db.query('select * from get_v2_subscription_catalogue()')).rows.map(row=>Object.values(row)[0]);
    assert.deepEqual(new Set(catalogue.map(row=>`${row.lab_slug}:${row.plan_id}`)),expected);
    assert.equal(Number((await db.query('select count(*) from v2_subscription_plan_offers')).rows[0].count),snapshot.plans.length);
    const originals=(await db.query('select plan_uuid,price,frequency from v2_subscription_plans')).rows;
    for (const plan of snapshot.plans) {
      const original=originals.find(row=>row.plan_uuid===plan.plan_uuid);
      assert.equal(original.price == null ? null : Number(original.price),plan.price); assert.equal(original.frequency,plan.frequency);
    }
    const features=(await db.query('select plan_uuid,feature_name,feature_value,feature_description,other_info from v2_subscription_plan_features')).rows;
    for (const feature of snapshot.features) {
      const original=features.find(row=>row.plan_uuid===feature.plan_uuid && row.feature_name===feature.feature_name);
      assert.equal(original.feature_value,feature.feature_value);
      assert.equal(original.feature_description,feature.feature_description);
      assert.deepEqual(original.other_info,feature.other_info);
    }
    const mappings=(await db.query('select plan_uuid,model_slug,model_info,rate_limit,other_info from v2_subscription_plan_models')).rows;
    for (const mapping of snapshot.models) {
      const original=mappings.find(row=>row.plan_uuid===mapping.plan_uuid && row.model_slug===mapping.model_slug);
      assert.deepEqual(original.model_info,mapping.model_info);
      assert.deepEqual(original.rate_limit,mapping.rate_limit);
      assert.deepEqual(original.other_info,mapping.other_info);
    }
    for (const relation of snapshot.models.filter(active)) {
      const originalPlan=snapshot.plans.find(plan=>plan.plan_uuid===relation.plan_uuid);
      if (!active(originalPlan)) continue;
      const model=snapshot.model_catalogue.find(row=>row.model_slug===relation.model_slug);
      if (model.hidden) continue;
      const plan=catalogue.find(row=>row.plan_id===originalPlan.plan_id && row.lab_slug===originalPlan.lab_slug);
      assert(plan.models.some(row=>row.model_slug===relation.model_slug),`${originalPlan.plan_id}: ${relation.model_slug}`);
    }
    console.log(`Live catalogue replay passed: ${snapshot.plans.length} historical price records, ${expected.size} active plans, ${snapshot.features.length} features, ${snapshot.models.length} model mappings preserved.`);
  } else {
  const rows = (await db.query('select * from get_v2_subscription_catalogue()')).rows.map(row=>Object.values(row)[0]);
  assert.equal(rows.length,5);
  const pro=rows.find(row=>row.plan_id==='pro');
  assert.equal(pro.plan_uuid,(await db.query("select md5('month')::uuid id")).rows[0].id);
  assert.equal(pro.offers.length,2);
  assert.equal(pro.models.length,1); assert.equal(pro.models[0].model_id,'model');
  assert(pro.features.some(f=>f.feature_name==='Annual Only'));
  assert.equal(pro.allowances.find(a=>a.allowance_key==='Points').quantity,10000);
  const daily=pro.allowances.find(a=>a.allowance_key==='Daily Credits');
  assert.equal(daily.quantity,2); assert.equal(daily.currency,'USD'); assert.equal(daily.grant_condition,'login');
  const rolling=pro.allowances.find(a=>a.allowance_key==='5-Hour Limit');
  assert.equal(rolling.window_kind,'rolling'); assert.equal(rolling.window_count,5); assert.equal(rolling.quantity_kind,'approximate');
  const credit=pro.allowances.find(a=>a.allowance_key==='GitHub AI Credits');
  assert.equal(credit.allocation_basis,'seat'); assert.equal(credit.pool_scope,'organisation'); assert.equal(credit.overage_price,0.01);
  const agents=pro.allowances.find(a=>a.allowance_key==='Agent Usage');
  assert.equal(agents.quantity,6); assert.equal(agents.quantity_max,7); assert.equal(agents.quantity_kind,'estimated');
  const custom=rows.find(row=>row.plan_id==='enterprise').offers[0].components[0];
  assert.equal(custom.pricing_type,'custom'); assert.equal(custom.amount,null);
  const usage=rows.find(row=>row.plan_id==='usage').offers[0].components[0]; assert.equal(usage.pricing_type,'usage_based'); assert.equal(usage.amount,null);
  const quarter=rows.find(row=>row.plan_id==='coding').offers[0];
  assert.equal(quarter.billing_interval_count,3); assert.equal(quarter.components[0].starts_at_cycle,2);
  assert.equal(rows.find(row=>row.plan_id==='windsurf-teams').offers[0].components.length,2);
  assert.equal((await db.query("select * from get_v2_subscription_catalogue(null,'hidden')")).rows.length,0);
  assert.equal((await db.query("select * from get_v2_subscription_catalogue(null,'model')")).rows.length,1);
  await assert.rejects(db.exec(`insert into v2_subscription_offer_prices(offer_uuid,component_key,pricing_type,amount) values(md5('month')::uuid,'invalid','custom',0)`));
  await assert.rejects(db.exec(`insert into v2_subscription_offer_prices(offer_uuid,component_key,pricing_type,amount) values(md5('month')::uuid,'invalid','fixed',-1)`));
  await db.exec(`update v2_subscription_plan_offers set effective_from=now()+interval '1 day' where legacy_plan_uuid=md5('year')::uuid`);
  const current=(await db.query("select * from get_v2_subscription_catalogue('pro')")).rows.map(row=>Object.values(row)[0])[0];
  assert.equal(current.offers.length,1);
  await assert.rejects(db.exec("insert into v2_subscription_plans(plan_uuid,plan_id,name,lab_slug) values(md5('duplicate')::uuid,'pro','Other Pro','other')"));
  await db.exec(`insert into users values(md5('admin')::uuid,'admin'),(md5('member')::uuid,'member');
    grant select on users to service_role;
    grant select,insert,update on v2_subscription_plans,v2_subscription_plan_models,v2_subscription_plan_features to service_role;
    grant select on v2_subscription_plans,v2_subscription_plan_features,v2_subscription_plan_models,v2_models,v2_labs to anon,authenticated;
    set role service_role;`);
  const payload={plan_id:'new',name:'New',offer:{billing_interval:'month',currency:'USD',components:[{component_key:'base',pricing_type:'fixed',amount:10}]}};
  await db.query("select mutate_v2_admin_subscription_plan(md5('admin')::uuid,'create',md5('new')::uuid,$1::jsonb)",[JSON.stringify(payload)]);
  await assert.rejects(db.query("select mutate_v2_admin_subscription_plan(md5('member')::uuid,'create',md5('no')::uuid,$1::jsonb)",[JSON.stringify({...payload,plan_id:'no'})]),/admin role/);
  await assert.rejects(db.query("select mutate_v2_admin_subscription_plan(md5('admin')::uuid,'create',md5('invalid')::uuid,$1::jsonb)",[JSON.stringify({...payload,plan_id:'invalid',offer:{...payload.offer,components:[{component_key:'base',pricing_type:'fixed',amount:-1}]}})]));
  assert.equal(Number((await db.query("select count(*) from v2_subscription_plans where plan_id='invalid'")).rows[0].count),0);
  await assert.rejects(db.query("select mutate_v2_admin_registry(md5('admin')::uuid,'plans',$1::jsonb,null)",[JSON.stringify({plan_uuid:pro.plan_uuid,plan_id:'pro',name:'Overwrite'})]),/Reload/);
  await db.exec('reset role');
  await db.exec('set role anon');
  assert.equal(Number((await db.query('select count(*) from v2_subscription_plan_offers')).rows[0].count),7);
  assert.equal((await db.query("select * from get_v2_subscription_catalogue(null,'hidden',true)")).rows.length,0);
  assert.equal((await db.query("select * from get_v2_subscription_catalogue('pro')")).rows.length,1);
  await assert.rejects(db.exec("insert into v2_subscription_feature_definitions values('bad','Bad','General','text')"));
  await assert.rejects(db.exec("select mutate_v2_admin_subscription_plan(md5('admin')::uuid,'create',md5('anon')::uuid,'{}')"));
  await db.exec('reset role');
  console.log('Subscription consolidation, offers, quotas, evidence, lifecycle, constraints and public read-only access passed.');
  }
} catch (error) {
  console.error(error.message, error.where ?? '');
  process.exitCode=1;
} finally { await db.close(); }

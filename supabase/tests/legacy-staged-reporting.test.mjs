import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
try {
  await db.exec(await read('./fixtures/staged-reporting-before.sql'));
  await db.exec(`
    insert into v2_models(model_slug,hidden,status) values ('legacy/public',false,'active'),('legacy/staged',true,'draft');
    insert into v2_model_provider_routes(provider_model_id,model_slug,provider_slug,access_scope,phaseo_status,routing_enabled,status,is_stealth,provider_availability_status)
      values ('legacy:public','legacy/public','legacy','public','enabled',true,'active',false,'available'),
             ('legacy:staged','legacy/staged','legacy','internal','testing',false,'active',false,'preview');
    insert into v2_request_facts(request_event_id,workspace_id,request_id,occurred_at,routed_model_slug,provider_model_id,safe_metadata)
      values ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','legacy-public',now(),'legacy/public','legacy:public','{}'),
             ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','legacy-staged',now(),'legacy/staged','legacy:staged','{}'),
             ('20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','legacy-testing',now(),'legacy/public','legacy:public','{"testing_mode":true}');
    insert into data_contributions(id,workspace_id,request_id,occurred_at,model_slug,provider_slug,input_tokens,output_tokens)
      values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','legacy-staged',now(),'legacy/staged','legacy',10,20),
             ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','legacy-testing',now(),'legacy/public','legacy',10,20);
    insert into request_classifications(contribution_id,classifier_id,primary_category)
      select id,'50000000-0000-4000-8000-000000000001','coding' from data_contributions;
    insert into request_classification_daily(usage_date,workspace_id,classifier_id,primary_category,model_slug,provider_slug,request_count,input_tokens,output_tokens)
      values (current_date,'30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','coding','legacy/staged','legacy',40,400,800),
             (current_date,'30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','coding','legacy/public','legacy',2,20,40);
    insert into v2_public_usage_daily(usage_date,model_slug,provider_model_id,requests)
      values(current_date,'legacy/staged','legacy:staged',40),(current_date,'legacy/public','legacy:public',1);
  `);
  for (const path of [
    '../migrations/20261009114400_exclude_staged_models_from_public_reporting.sql',
    '../migrations/20261009114500_admin_staged_model_release.sql',
    '../migrations/20261009114619_align_staged_reporting_function_definitions.sql',
    '../migrations/20261009120500_classify_legacy_public_reporting_history.sql',
  ]) await db.exec(await read(path));
  const flags = (await db.query('select request_id,public_reporting_allowed from v2_request_facts order by request_id')).rows;
  assert.deepEqual(flags, [
    {request_id:'legacy-public',public_reporting_allowed:true},
    {request_id:'legacy-staged',public_reporting_allowed:false},
    {request_id:'legacy-testing',public_reporting_allowed:false},
  ]);
  assert.equal((await db.query('select count(*) n from data_contributions where public_reporting_allowed')).rows[0].n, 0);
  await db.exec(`update v2_models set hidden=false,status='active' where model_slug='legacy/staged';
    update v2_model_provider_routes set access_scope='public',phaseo_status='enabled',routing_enabled=true where provider_model_id='legacy:staged';`);
  assert.equal((await db.query('select count(*) n from reporting_request_facts')).rows[0].n, 1);
  assert.equal((await db.query("select count(*) n from reporting_classification_daily where model_slug='legacy/staged'")).rows[0].n, 0);
  assert.equal((await db.query("select request_count n from reporting_classification_daily where model_slug='legacy/public'")).rows[0].n, 1);
  assert.equal((await db.query("select count(*) n from reporting_usage_daily where model_slug='legacy/staged'")).rows[0].n, 0);
  assert.equal((await db.query("select request_count n from request_classification_daily where model_slug='legacy/staged'")).rows[0].n, 40);
  console.log('Legacy staged history stays private after release; existing public and private counts are preserved');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.close();
}

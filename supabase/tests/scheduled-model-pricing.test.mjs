// Run with PGLITE_MODULE pointing to an externally installed PGlite module.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`
create role service_role; create role anon; create role authenticated;
create table v2_route_variants(variant_id uuid,provider_model_id text,service_tier_slug text,execution_region text,data_region text,status text,routing_enabled boolean,metadata jsonb);
create table v2_model_provider_routes(provider_slug text,provider_model_id text,model_slug text,provider_model_slug text,status text,routing_enabled boolean,provider_availability_status text,phaseo_status text,access_scope text,input_modalities text[],output_modalities text[],context_length integer,max_output_tokens integer,effective_from timestamptz,effective_to timestamptz,metadata jsonb);
create table v2_providers(provider_slug text,name text,status text,routing_enabled boolean,provider_family_slug text,offer_label text,offer_scope text,country_code text,metadata jsonb,base_url text,residency_mode text,default_execution_regions text[],default_data_regions text[],zero_data_retention boolean,prompt_training_policy text,data_policy_tier text,data_policy_confidence text,data_policy_contract_mode text);
create table v2_route_capabilities(provider_model_id text,capability_id text,status text,params jsonb,metadata jsonb,max_input_tokens integer,max_output_tokens integer);
create table v2_pricing_skus(sku_id uuid,provider_model_id text,operation text,service_tier_slug text,currency text,status text,effective_from timestamptz,effective_to timestamptz,metadata jsonb,description text);
create table v2_pricing_sku_meters(sku_id uuid,sku_meter_id uuid,meter_key text,modality text,direction text,display_label text,display_unit text,unit text,unit_quantity numeric,price_nanos numeric,meter_order integer,billable boolean,metadata jsonb);
insert into v2_providers(provider_slug,name,status,routing_enabled,metadata) values ('test','Test','active',true,'{}');
insert into v2_model_provider_routes(provider_slug,provider_model_id,model_slug,access_scope,routing_enabled,status,phaseo_status,metadata) values('test','route','model','public',false,'active','blocked','{}');
insert into v2_route_variants(provider_model_id,service_tier_slug,status,routing_enabled,metadata) select 'route',tier,'disabled',false,'{}' from unnest(array['standard','batch','flex','priority']) tier;
insert into v2_pricing_skus(sku_id,provider_model_id,operation,service_tier_slug,currency,status,effective_from,effective_to,metadata)
select md5(tier||period)::uuid,'route','text.generate',tier,'USD','draft',
case when period='future' then now()+interval '1 day' else now()-interval '1 day' end,
case when period='current' then now()+interval '1 day' when period='expired' then now()-interval '1 hour' else null end,'{}'
from unnest(array['standard','batch','flex','priority']) tier cross join unnest(array['current','future','expired','disabled','future-draft']) period;
update v2_pricing_skus set effective_from=now()+interval '1 day',effective_to=null where sku_id in (select md5(tier||'future-draft')::uuid from unnest(array['standard','batch','flex','priority']) tier);
update v2_pricing_skus set status='active' where sku_id in (select md5(tier||'future')::uuid from unnest(array['standard','batch','flex','priority']) tier);
insert into v2_pricing_skus(sku_id,provider_model_id,operation,service_tier_slug,currency,status,effective_from,metadata) values(md5('future-only')::uuid,'route','text.generate','future-only','USD','active',now()+interval '1 day','{}');
update v2_pricing_skus set status='disabled' where sku_id in (select md5(tier||'disabled')::uuid from unnest(array['standard','batch','flex','priority']) tier);
insert into v2_pricing_sku_meters(sku_id,meter_key,unit,unit_quantity,price_nanos,billable,meter_order,metadata) select sku_id,'input_text_tokens','token',1000000,2000000000,true,1,'{}' from v2_pricing_skus;
`);
await db.exec(await readFile(new URL('../migrations/20261008101500_expose_scheduled_model_pricing.sql',import.meta.url),'utf8'));
const payload=(await db.query("select * from get_v2_model_pricing_without_stealth_redaction('model')")).rows[0].get_v2_model_pricing_without_stealth_redaction;
assert.equal(payload.pricing_rules.length,8,'current and approved future rules included; expired, disabled, future drafts and future-only tiers excluded');
for (const tier of ['standard','batch','flex','priority']) {
  assert.equal(payload.pricing_rules.filter(r=>r.pricing_plan===tier).length,2);
  const filtered=(await db.query('select * from get_v2_model_pricing_without_stealth_redaction($1,null,$2)',['model',tier])).rows[0].get_v2_model_pricing_without_stealth_redaction;
  assert.equal(filtered.pricing_rules.length,2,'tier filter preserved');
}
assert.ok(payload.provider_models.every(r=>r.is_active_gateway===false),'display pricing does not enable routing');
await db.close();
console.log('Scheduled pricing regression passed');

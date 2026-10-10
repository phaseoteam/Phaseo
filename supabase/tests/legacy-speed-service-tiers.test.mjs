import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const operation = readFileSync(new URL("../operations/legacy-speed-service-tiers.sql", import.meta.url), "utf8");

test("legacy speed cutover preserves prices, route gates and IDs and is repeatable", async () => {
 const db = new PGlite();
 try {
  await db.exec(`
   create table v2_models(model_slug text primary key,hidden boolean default false,status text default 'active',catalogue_status text default 'available',replacement_model_slug text,metadata jsonb default '{}',updated_at timestamptz default now());
   create table v2_service_tiers(service_tier_slug text primary key,status text);
   create table v2_model_provider_routes(provider_model_id text primary key,model_slug text,provider_slug text,provider_model_slug text,status text,routing_enabled boolean,phaseo_status text,access_scope text,provider_availability_status text,metadata jsonb default '{}',updated_at timestamptz default now());
   create table v2_route_capabilities(provider_model_id text,capability_id text,params jsonb,updated_at timestamptz default now());
   create table v2_pricing_skus(sku_id text primary key,provider_model_id text,status text,operation text,service_tier_slug text,updated_at timestamptz default now());
   create table v2_pricing_sku_meters(sku_id text,meter_key text,price_nanos numeric,unit_quantity numeric);
   create table v2_route_variants(variant_id text primary key,provider_model_id text,service_tier_slug text,updated_at timestamptz default now());
   insert into v2_models(model_slug) values ('minimax/minimax-m2.5'),('minimax/minimax-m2.5-highspeed'),('moonshotai/kimi-k2.7-code'),('moonshotai/kimi-k2.7-code-highspeed'),('xiaomi/mimo-v2.5-pro'),('xiaomi/mimo-v2.5-pro-ultraspeed');
   insert into v2_service_tiers values('priority','active');
   insert into v2_model_provider_routes values
    ('minimax-route','minimax/minimax-m2.5-highspeed','minimax','MiniMax-M2.5-highspeed','active',true,'enabled','public','available','{}',now()),
    ('kimi-route','moonshotai/kimi-k2.7-code-highspeed','zenmux','kimi-native','disabled',false,'unsupported','public','available','{}',now()),
    ('mimo-route','xiaomi/mimo-v2.5-pro-ultraspeed','xiaomi','mimo-v2.5-pro-ultraspeed','active',true,'enabled','public','available','{}',now()),
    ('empirio-route','moonshotai/kimi-k2.7-code-highspeed','empiriolabs','kimi-native','disabled',false,'blocked','public','available','{}',now());
   insert into v2_route_capabilities select provider_model_id,'text.generate','{"temperature":true,"service_tier":{"note":"preserve"}}' from v2_model_provider_routes;
   insert into v2_pricing_skus select provider_model_id||'-sku',provider_model_id,'active','text.generate','standard',now() from v2_model_provider_routes;
   insert into v2_pricing_sku_meters select sku_id,'input_text_tokens',123456789,1000000 from v2_pricing_skus;
   insert into v2_route_variants select provider_model_id||'-variant',provider_model_id,'standard',now() from v2_model_provider_routes;
  `);
  const before = (await db.query("select * from v2_pricing_sku_meters order by sku_id")).rows;
  const gates = (await db.query("select provider_model_id,provider_model_slug,status,routing_enabled,phaseo_status,access_scope,provider_availability_status from v2_model_provider_routes order by provider_model_id")).rows;
  await db.exec(operation);
  assert.deepEqual((await db.query("select * from v2_pricing_sku_meters order by sku_id")).rows, before);
  assert.deepEqual((await db.query("select provider_model_id,provider_model_slug,status,routing_enabled,phaseo_status,access_scope,provider_availability_status from v2_model_provider_routes order by provider_model_id")).rows, gates);
  assert.equal((await db.query("select count(*)::integer as n from v2_models where hidden and metadata->'serving_tier'->>'name'='fast'")).rows[0].n, 3);
  assert.equal((await db.query("select count(*)::integer as n from v2_pricing_skus where service_tier_slug='priority'")).rows[0].n, 3);
  assert.equal((await db.query("select params->'service_tier'->>'note' as note from v2_route_capabilities where provider_model_id='minimax-route'")).rows[0].note, "preserve");
  assert.equal((await db.query("select model_slug from v2_model_provider_routes where provider_model_id='empirio-route'")).rows[0].model_slug, "moonshotai/kimi-k2.7-code-highspeed");
  await db.exec(operation);
  assert.deepEqual((await db.query("select * from v2_pricing_sku_meters order by sku_id")).rows, before);
 } finally { await db.close(); }
});

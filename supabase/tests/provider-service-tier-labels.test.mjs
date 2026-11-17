// Run with PGLITE_MODULE pointing to an externally installed PGlite module.
// get_v2_model_pricing must return each provider's own tier names
// (v2_providers.metadata.service_tier_labels) and hide them on stealth routes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const migrationFile = '../migrations/20261117160000_expose_provider_service_tier_labels.sql';
const schemaFile = '../schemas/public/functions/get_v2_model_pricing.sql';
const migration = await readFile(new URL(migrationFile, import.meta.url), 'utf8');
const schema = await readFile(new URL(schemaFile, import.meta.url), 'utf8');
const body = (sql) => sql.slice(sql.indexOf('$function$'), sql.lastIndexOf('$function$'));
assert.equal(body(schema), body(migration), 'declarative definition matches the migration');

const db = new PGlite();
await db.exec(`
create role service_role; create role anon; create role authenticated;
create table v2_providers(provider_slug text, metadata jsonb);
create table v2_model_provider_routes(provider_model_id text, is_stealth boolean);
create table v2_pricing_skus(sku_id uuid, provider_model_id text);
insert into v2_providers values
  ('named', '{"service_tier_labels":{"priority":"Highspeed"}}'),
  ('unnamed', '{}'),
  ('bad', '{"service_tier_labels":"Highspeed"}'),
  ('hidden', '{"service_tier_labels":{"priority":"Secret"}}');
insert into v2_model_provider_routes values ('named:m', false), ('unnamed:m', false), ('bad:m', false), ('hidden:m', true);
create function get_v2_model_pricing_without_stealth_redaction(p_model_slug text, p_region text, p_service_tier text)
returns setof jsonb language sql as $$
  select jsonb_build_object(
    'provider', jsonb_build_object('api_provider_id', slug, 'service_tier_data_policies', '{}'::jsonb),
    'provider_models', jsonb_build_array(jsonb_build_object('id', slug || ':m', 'model_id', 'm')),
    'pricing_rules', '[]'::jsonb)
  from unnest(array['named', 'unnamed', 'bad', 'hidden']) slug
  union all select '{"provider_models":[],"pricing_rules":[]}'::jsonb
$$;
`);
await db.exec(migration);

const rows = (await db.query("select * from get_v2_model_pricing('m')")).rows.map((row) => row.get_v2_model_pricing);
const byProvider = Object.fromEntries(rows.filter((row) => row.provider).map((row) => [row.provider.api_provider_id, row.provider]));
assert.deepEqual(byProvider.named.service_tier_labels, { priority: 'Highspeed' }, 'stored names are returned');
assert.deepEqual(byProvider.named.service_tier_data_policies, {}, 'other provider fields are kept');
assert.equal(byProvider.unnamed.service_tier_labels, null, 'missing names are null');
assert.equal(byProvider.bad.service_tier_labels, null, 'names that are not an object are null');
assert.equal(byProvider.stealth.service_tier_labels, null, 'stealth providers do not reveal their names');
assert.deepEqual(rows.find((row) => !row.provider), { provider_models: [], pricing_rules: [] }, 'payloads without a provider are unchanged');
await db.close();
console.log('Provider service tier labels regression passed');

// Run with PGLITE_MODULE pointing to @electric-sql/pglite's dist/index.js.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const db = new PGlite();
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

try {
  await db.exec(`begin; set timezone = 'UTC';
    create role anon; create role authenticated; create role service_role;
    create schema private;
    create sequence resolver_calls;
    create table private.v2_rpc_gateway_requests_compat (
      canonical_model_id text, model_id text, provider text, usage jsonb,
      throughput numeric, latency_ms numeric, created_at timestamptz default now()
    );
    create table private.v2_rpc_models_compat (
      model_id text primary key, name text, release_date date, retirement_date date,
      status text, input_types text, output_types text, organisation_id text, hidden boolean
    );
    create table private.v2_rpc_routes_compat (
      provider_api_model_id text primary key, model_id text, api_model_id text,
      provider_id text, provider_model_slug text, is_active_gateway boolean,
      input_modalities text[], output_modalities text[], quantization_scheme text,
      context_length integer, max_output_tokens integer, effective_from timestamptz,
      effective_to timestamptz, updated_at timestamptz
    );
    create table private.v2_rpc_capabilities_compat (
      provider_api_model_id text, capability_id text, params jsonb, status text,
      max_input_tokens integer, max_output_tokens integer
    );
    create table private.v2_rpc_labs_compat (organisation_id text, name text);
    create table private.v2_rpc_providers_compat (api_provider_id text, api_provider_name text, link text);
    create table private.v2_rpc_pricing_compat (
      model_key text, meter text, unit text, unit_size numeric, price_per_unit numeric,
      pricing_plan text, effective_from timestamptz, effective_to timestamptz
    );
    create table public.v2_model_aliases (alias_slug text, model_slug text, enabled boolean);
    insert into private.v2_rpc_models_compat (model_id,name,hidden,organisation_id)
      values ('model-a','A',false,'lab'), ('model-b','B',false,'lab'),
        ('model-empty','Empty',false,'lab'), ('model-hidden','Hidden',true,'lab');
    insert into private.v2_rpc_labs_compat values ('lab','Lab');
    insert into private.v2_rpc_providers_compat values ('provider-a','Provider A','https://a.example'),
      ('provider-b','Provider B','https://b.example');
    insert into public.v2_model_aliases values ('alias-a','model-a',true),
      ('alias-b','model-b',true), ('disabled-alias','model-b',false);
    insert into private.v2_rpc_routes_compat
      (provider_api_model_id,model_id,api_model_id,provider_id,provider_model_slug,is_active_gateway,updated_at)
      values ('route-a','model-a','shared-api','provider-a','legacy-slug',true,now()),
        ('route-a-free','model-a','model-a:free','provider-a','free-slug',true,now()),
        ('route-b','model-b','shared-api','provider-b','other-slug',true,now()),
        ('route-empty','model-empty','empty-api','provider-a','empty-slug',true,now()),
        ('route-hidden','model-hidden','hidden-api','provider-a','hidden-slug',true,now()),
        ('route-fallback',null,'unmapped-api','provider-a','unmapped-slug',true,now());
    insert into private.v2_rpc_capabilities_compat
      select provider_api_model_id,'text.generate','{}','active',10000,1000
      from private.v2_rpc_routes_compat;
    insert into private.v2_rpc_capabilities_compat values ('route-a','embeddings','{}','active',8000,null);
    insert into private.v2_rpc_pricing_compat values
      ('provider-a:shared-api:text.generate','input_tokens','token',1000000,2,'standard',null,null),
      ('provider-a:shared-api:text.generate','output_tokens','token',1000000,4,'standard',null,null),
      ('provider-a:shared-api:text.generate','input_tokens','token',1000000,999,'standard',null,now()-interval '1 day'),
      ('provider-a:model-a:free:text.generate','input_tokens','token',1000000,0,'standard',null,null);
    insert into private.v2_rpc_gateway_requests_compat
      (canonical_model_id,model_id,provider,usage,throughput,latency_ms) values
      (null,'alias-a','provider-a','{"total_tokens":100}',10,100),
      ('','alias-a','provider-a','{"total_tokens":200}',20,null),
      (null,'shared-api','provider-a','{"input_tokens":10,"output_tokens":20}',null,200),
      ('model-a','alias-b','provider-b','{"total_tokens":7}',40,400),
      (null,'legacy-slug','provider-a','{"total_tokens":9}',0,0),
      (null,'route-a','provider-a','{"total_tokens":11}',15,250),
      (null,'alias-a',null,'{"total_tokens":13}',25,300),
      (null,'alias-a','','{"total_tokens":17}',null,350),
      (null,'alias-a','unknown','{"total_tokens":19}',35,null),
      ('model-a','model-a','provider-a','{"total_tokens":23}',65,500),
      (null,'shared-api','provider-b','{"total_tokens":5}',null,null),
      (null,'hidden-slug','provider-a','{"total_tokens":50}',80,700),
      (null,'unmapped-api','provider-a','{"total_tokens":31}',null,null),
      (null,'disabled-alias','provider-a','{"total_tokens":999}',99,999),
      (' ','alias-a','provider-a','{"total_tokens":999}',99,999),
      (null,null,'provider-a',null,null,null),
      (null,'','provider-a','{}',null,null);
    insert into private.v2_rpc_gateway_requests_compat
      (model_id,provider,usage,created_at) values
      ('alias-b','provider-b','{"total_tokens":11}',now()-interval '7 days'),
      ('alias-a','provider-a','{"total_tokens":999}',now()-interval '7 days 1 microsecond');
  `);

  // Instrument the actual resolver, without changing its lookup rules.
  const resolver = (await read('../schemas/public/functions/resolve_public_model_id.sql'))
    .replace(/\nbegin\r?\n/, '\nbegin\n  perform nextval(\'public.resolver_calls\');\n');
  assert.match(resolver, /perform nextval/);
  await db.exec(resolver);
  await db.exec(await read('../schemas/public/functions/gateway_usage_total_tokens.sql'));
  await db.exec((await read('./fixtures/monitor-model-rows-before.sql'))
    .replaceAll('get_monitor_model_rows', 'monitor_model_rows_before'));
  await db.exec(await read('../schemas/public/functions/get_monitor_model_rows.sql'));

  const measuredRows = async (name, includeHidden) => {
    await db.exec('alter sequence resolver_calls restart with 1');
    const start = performance.now();
    const result = await db.query(`select * from public.${name}($1)`, [includeHidden]);
    const elapsed = performance.now() - start;
    const count = await db.query('select case when is_called then last_value else 0 end as calls from resolver_calls');
    return { rows: result.rows, calls: Number(count.rows[0].calls), elapsed };
  };
  let groupedCalls;
  for (const includeHidden of [false, true]) {
    const before = await measuredRows('monitor_model_rows_before', includeHidden);
    const after = await measuredRows('get_monitor_model_rows', includeHidden);
    if (includeHidden) groupedCalls = after.calls;
    assert.deepEqual(after.rows, before.rows, `All output fields, hidden=${includeHidden}`);
    const model = after.rows.find((row) => row.provider_api_model_id === 'route-a' && row.capability_id === 'text.generate');
    assert.equal(Number(model.weekly_tokens_model), 429);
    assert.equal(Number(model.weekly_tokens_model_provider), 373);
    assert.equal(Number(model.weekly_throughput_model), 26.25);
    assert.equal(Number(model.weekly_latency_model), 263);
    assert.equal(Number(model.input_price), 2);
    assert.equal(Number(model.output_price), 4);
    const empty = after.rows.find((row) => row.model_id === 'model-empty');
    assert.equal(empty.weekly_tokens_model, null);
    assert.equal(empty.weekly_throughput_model, null);
    assert.equal(empty.weekly_latency_model, null);
    assert.equal(after.rows.some((row) => row.model_id === 'model-hidden'), includeHidden);
    const boundary = after.rows.find((row) => row.model_id === 'model-b');
    assert.equal(Number(boundary.weekly_tokens_model), 16);
    assert.equal(boundary.weekly_throughput_model, null);
    const free = after.rows.find((row) => row.provider_api_model_id === 'route-a-free');
    assert.equal(free.is_free_variant, true);
    assert.equal(Number(free.input_price), 0);
  }

  // An uneven distribution catches averaging group averages or counts of NULLs.
  await db.exec(`insert into private.v2_rpc_gateway_requests_compat
    (model_id,provider,usage,throughput,latency_ms)
    select case when i%10=0 then 'legacy-slug' else 'alias-a' end, 'provider-a',
      case when i%3=0 then '{}'::jsonb else '{"total_tokens":3}'::jsonb end,
      case when i%4=0 then null else i%101 end,
      case when i%7=0 then null else i%1001 end
    from generate_series(1,20000) i;
    insert into private.v2_rpc_gateway_requests_compat
      (canonical_model_id,model_id,provider,usage) values ('model-empty','empty-api','provider-a','{}');
  `);
  const before = await measuredRows('monitor_model_rows_before', true);
  const after = await measuredRows('get_monitor_model_rows', true);
  assert.deepEqual(after.rows, before.rows, 'Large uneven groups preserve every output field');
  assert(before.calls >= 20000, `Baseline resolves each request (${before.calls})`);
  assert.equal(after.calls, groupedCalls, 'Adding 20,000 requests with existing identifiers adds no model lookups');
  const zero = after.rows.find((row) => row.model_id === 'model-empty');
  assert.equal(Number(zero.weekly_tokens_model), 0);
  assert.equal(zero.weekly_throughput_model, null);
  const privileges = await db.query(`select
    has_function_privilege('anon','public.get_monitor_model_rows(boolean)','execute') as anon,
    has_function_privilege('authenticated','public.get_monitor_model_rows(boolean)','execute') as authenticated,
    has_function_privilege('service_role','public.get_monitor_model_rows(boolean)','execute') as service_role`);
  assert.deepEqual(privileges.rows, [{ anon: false, authenticated: false, service_role: true }]);
  console.log(JSON.stringify({
    cases: 'All columns equivalent; aliases, providers, visibility, pricing, weighted averages, NULLs, zero totals, 7-day boundary and grants passed',
    resolverCallsBefore: before.calls, resolverCallsAfter: after.calls,
    localMillisecondsBefore: Math.round(before.elapsed), localMillisecondsAfter: Math.round(after.elapsed),
  }, null, 2));
} finally {
  await db.close();
}
